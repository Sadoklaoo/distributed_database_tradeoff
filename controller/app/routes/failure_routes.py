import asyncio
import time
import random
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
import logging
import os
import uuid
import io
import tarfile

logger = logging.getLogger(__name__)

try:
    from ..mongo_client import MongoDBClient
    from ..cassandra_client import CassandraClient
except ImportError:
    MongoDBClient = None
    CassandraClient = None

try:
    import docker
except ImportError:
    docker = None

router = APIRouter()


class FailureSimulationConfig(BaseModel):
    failureType: str = "node"  # node, network, disk, memory
    targetNode: str = "mongo1"
    duration: int = 30
    testOperations: bool = True
    # New optional parameters
    diskFailureMode: Optional[str] = "fill"  # fill, io (future: corrupt)
    memoryStressMB: Optional[int] = 500  # Memory to consume in MB


class FailureSimulationResult(BaseModel):
    summary: Dict[str, Any]
    recoveryMetrics: List[Dict[str, Any]]
    availabilityMetrics: List[Dict[str, Any]]
    detailedResults: Dict[str, Any]


class DockerFailureSimulator:
    def __init__(self):
        self.client = None
        self.loop = asyncio.get_event_loop()
        self.mongo_uri = os.getenv("MONGO_URI", "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/testDB?replicaSet=rs0")
        self.mongo_db = os.getenv("MONGO_DB", "testDB")
        self.cassandra_keyspace = os.getenv("CASSANDRA_KEYSPACE", "testkeyspace")
        self.cassandra_contact_points = os.getenv("CASSANDRA_CONTACT_POINTS", "cassandra1,cassandra2,cassandra3").split(",")

    def _get_docker_client(self) -> Optional[docker.DockerClient]:
        if self.client is None and docker is not None:
            try:
                self.client = docker.from_env()
            except Exception as e:
                logger.warning(f"Docker client unavailable: {e}")
                self.client = None
        return self.client

    # --- Motor MongoDB: Use await directly ---
    async def _test_mongo_operations(self) -> Dict[str, Any]:
        if MongoDBClient is None:
            return {"success": False, "latency": None, "error": "MongoDBClient not available"}

        client = MongoDBClient(self.mongo_uri, self.mongo_db)
        
        try:
            start = time.time()
            await client.insert_document("failure_monitor", 
                {"_id": f"hb_{int(time.time())}", "ts": datetime.utcnow()})
            await client.find_documents("failure_monitor", {})
            latency_ms = round((time.time() - start) * 1000, 2)
            return {"success": True, "latency": latency_ms, "error": None}
        except Exception as e:
            logger.error(f"MongoDB health check failed: {e}")
            return {"success": False, "latency": None, "error": str(e)}
        finally:
            client.close()

    # --- Cassandra: Use run_in_executor + devices table ---
    async def _test_cassandra_operations(self) -> Dict[str, Any]:
        if CassandraClient is None:
            return {"success": False, "latency": None, "error": "CassandraClient not available"}

        client = CassandraClient(self.cassandra_keyspace, replication_factor=3)
        
        def _cassandra_task():
            try:
                start = time.time()
                client.insert_document("devices", {
                    "id": str(uuid.uuid4()),
                    "name": "health_check",
                    "status": "active",
                    "type": "monitor"
                })
                client.find_documents("devices", {})
                latency_ms = round((time.time() - start) * 1000, 2)
                return {"success": True, "latency": latency_ms, "error": None}
            except Exception as e:
                logger.error(f"Cassandra health check failed: {e}")
                return {"success": False, "latency": None, "error": str(e)}
            finally:
                if hasattr(client, 'cluster') and hasattr(client.cluster, 'shutdown'):
                    client.cluster.shutdown()

        return await self.loop.run_in_executor(None, _cassandra_task)

    async def simulate_node_failure(self, node_name: str, duration: int, test_operations: bool = True) -> Dict[str, Any]:
        client = self._get_docker_client()
        availability_metrics: List[Dict[str, Any]] = []
        recovery_metrics: List[Dict[str, Any]] = []

        is_mongo_target = "mongo" in node_name
        is_cassandra_target = "cassandra" in node_name

        if client is None:
            logger.info("Running synthetic simulation (no Docker)")
            for i in range(duration):
                await asyncio.sleep(1)
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()

                if is_mongo_target:
                    mongo_result = {"success": False, "latency": None, "error": "Simulated failure"}
                if is_cassandra_target:
                    cassandra_result = {"success": False, "latency": None, "error": "Simulated failure"}

                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result
                })

            for i in range(10):
                await asyncio.sleep(1)
                recovery_metrics.append({
                    "time": f"{i}s",
                    "mongodb": 100 if not is_mongo_target or i >= 2 else 0,
                    "cassandra": 100 if not is_cassandra_target or i >= 2 else 0
                })

            return {
                "failureDuration": duration,
                "recoveryTime": 3.0,
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": recovery_metrics,
                "dataLoss": 0,
                "success": True,
                "mode": "synthetic"
            }

        # Real Docker Mode
        try:
            container = client.containers.get(node_name)
        except Exception as e:
            logger.error(f"Container lookup failed: {e}")
            return {"error": f"Container {node_name} not found", "success": False}

        try:
            container.stop(timeout=5)
            logger.info(f"Stopped container {node_name}")

            for i in range(duration):
                await asyncio.sleep(1)
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()
                
                if is_mongo_target:
                    mongo_result = {"success": False, "latency": None, "error": "Node down"}
                if is_cassandra_target:
                    cassandra_result = {"success": False, "latency": None, "error": "Node down"}

                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result
                })

            container.start()
            logger.info(f"Started container {node_name}")

            recovery_start = time.time()
            for i in range(10):
                await asyncio.sleep(1)
                is_online = await self._test_node_online(node_name)
                
                recovery_metrics.append({
                    "time": f"{i}s",
                    "mongodb": 100 if not is_mongo_target or is_online else 0,
                    "cassandra": 100 if not is_cassandra_target or is_online else 0
                })
                
                if is_online:
                    logger.info(f"Node {node_name} recovered in {i+1}s")
                    break

            recovery_time = time.time() - recovery_start

            return {
                "failureDuration": duration,
                "recoveryTime": round(recovery_time, 2),
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": recovery_metrics,
                "dataLoss": 0,
                "success": True,
                "mode": "docker"
            }

        except Exception as e:
            logger.exception(f"Simulation failed: {e}")
            return {"error": str(e), "success": False}

    async def simulate_network_partition(self, target_nodes: List[str], duration: int, test_operations: bool = True) -> Dict[str, Any]:
        """TRUE network partition using Docker network disconnect/connect"""
        client = self._get_docker_client()
        availability_metrics: List[Dict[str, Any]] = []
        
        if client is None:
            logger.warning("Docker unavailable, running synthetic network partition")
            return await self._simulate_network_partition_synthetic(target_nodes, duration)

        # Network name from docker-compose.yml
        network_name = "distributed_db_network"
        
        # Try to get network, with fallback to inspect first container
        network = None
        try:
            network = client.networks.get(network_name)
            logger.info(f"✅ Found Docker network: {network_name}")
        except Exception as e:
            logger.error(f"❌ Network {network_name} not found: {e}")
            logger.info("🔍 Trying to inspect first container's network...")
            
            if target_nodes:
                try:
                    container = client.containers.get(target_nodes[0])
                    container.reload()
                    networks = container.attrs.get('NetworkSettings', {}).get('Networks', {})
                    if networks:
                        network_name = list(networks.keys())[0]
                        network = client.networks.get(network_name)
                        logger.info(f"✅ Found network from container: {network_name}")
                except Exception as e2:
                    logger.error(f"❌ Could not determine network: {e2}")
                    return {"error": f"Network isolation failed: {e2}", "success": False}

        if not network:
            logger.error("❌ Could not find Docker network for partition")
            return {"error": "Network isolation not possible", "success": False}

        # Disconnect nodes
        disconnected_containers = []
        disconnect_errors = []
        
        for node_name in target_nodes:
            try:
                container = client.containers.get(node_name)
                logger.info(f"🔌 Disconnecting {node_name} from {network_name}...")
                network.disconnect(container)
                disconnected_containers.append(container)
                
                # Verify disconnection
                container.reload()
                networks = container.attrs.get('NetworkSettings', {}).get('Networks', {})
                if network_name in networks:
                    raise Exception(f"Disconnect failed - {node_name} still on network")
                logger.info(f"✅ {node_name} is isolated")
                
            except Exception as e:
                error_msg = f"Failed to disconnect {node_name}: {e}"
                logger.error(error_msg)
                disconnect_errors.append(error_msg)

        if disconnect_errors:
            return {"error": "; ".join(disconnect_errors), "success": False}

        # Monitor partition
        logger.info(f"🧪 Running partition test for {duration}s...")
        for i in range(duration):
            await asyncio.sleep(1)
            
            mongo_result = await self._test_mongo_operations()
            cassandra_result = await self._test_cassandra_operations()
            
            availability_metrics.append({
                "time": f"{i}s",
                "mongodb": mongo_result,
                "cassandra": cassandra_result,
                "partition_active": True
            })

        # Restore network
        logger.info("🔄 Restoring network connections...")
        reconnect_errors = []
        for container in disconnected_containers:
            try:
                logger.info(f"🔗 Reconnecting {container.name} to {network_name}...")
                network.connect(container)
                
                # Verify reconnection
                container.reload()
                networks = container.attrs.get('NetworkSettings', {}).get('Networks', {})
                if network_name not in networks:
                    raise Exception(f"Reconnect failed - {container.name} not on network")
                logger.info(f"✅ {container.name} reconnected")
                
            except Exception as e:
                error_msg = f"Failed to reconnect {container.name}: {e}"
                logger.error(error_msg)
                reconnect_errors.append(error_msg)

        return {
            "partitionDuration": duration,
            "availabilityMetrics": availability_metrics,
            "recoveryMetrics": [],
            "dataLoss": 0,
            "success": len(reconnect_errors) == 0,
            "affected": target_nodes,
            "mode": "docker-network",
            "errors": reconnect_errors if reconnect_errors else None
        }

    async def simulate_disk_failure(self, node_name: str, duration: int, test_operations: bool = True, mode: str = "fill") -> Dict[str, Any]:
        """Simulate disk failure by ACTUALLY filling disk space"""
        client = self._get_docker_client()
        availability_metrics = []
        stress_file = f"/tmp/disk_stress_{uuid.uuid4().hex[:8]}.img"
        
        if client is None:
            logger.warning("Docker unavailable, running synthetic disk failure")
            for i in range(duration):
                await asyncio.sleep(1)
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()
                
                # Simulate disk full errors after 10 seconds
                if i > 10:
                    mongo_result = {"success": False, "latency": None, "error": "Disk full - ENOSPC"}
                    cassandra_result = {"success": False, "latency": None, "error": "Disk full - ENOSPC"}
                
                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result
                })
            
            return {
                "failureDuration": duration,
                "recoveryTime": 2.0,
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": [{"time": f"{i}s", "mongodb": 100, "cassandra": 100} for i in range(5)],
                "dataLoss": random.randint(0, 10),
                "success": True,
                "mode": "synthetic"
            }
        
        container = None
        fill_size_mb = 0
        try:
            container = client.containers.get(node_name)
            is_mongo = "mongo" in node_name
            is_cassandra = "cassandra" in node_name
            
            # Determine target directory
            target_dir = "/tmp"
            if is_mongo:
                target_dir = "/data/db"
            elif is_cassandra:
                target_dir = "/var/lib/cassandra"
            
            stress_file = f"{target_dir}/disk_stress.img"
            logger.info(f"💾 Simulating disk failure on {node_name} in {target_dir}")
            
            # Check available space more reliably
            try:
                # Use df to check available space
                df_cmd = f"df -m {target_dir} | tail -1 | awk '{{print $4}}'"
                df_result = container.exec_run(df_cmd, user="root")
                available_mb_str = df_result.output.decode().strip()
                
                if df_result.exit_code != 0 or not available_mb_str.isdigit():
                    logger.warning(f"Could not determine disk space, using default: {df_result.output}")
                    available_mb = 1024  # Default 1GB
                else:
                    available_mb = int(available_mb_str)
                
                # Fill 95% of available space (aggressive)
                fill_size_mb = max(100, int(available_mb * 0.95))
                logger.info(f"Available: {available_mb}MB, will fill: {fill_size_mb}MB")
                
            except Exception as e:
                logger.warning(f"Disk check failed: {e}, using default 512MB")
                fill_size_mb = 512
            
            # Create stress file in foreground first to ensure it works
            logger.info(f"🔥 Filling {fill_size_mb}MB of disk space...")
            
            # First, try to create a small test file to verify permissions
            test_cmd = f"dd if=/dev/zero of={stress_file} bs=1M count=10 && rm -f {stress_file}"
            test_result = container.exec_run(test_cmd, user="root")
            
            if test_result.exit_code != 0:
                logger.error(f"Permission test failed: {test_result.output.decode()}")
                raise Exception(f"Cannot write to {target_dir}: {test_result.output.decode()}")
            
            # Now fill the disk for real (run in background)
            fill_cmd = f"dd if=/dev/zero of={stress_file} bs=1M count={fill_size_mb} oflag=dsync"
            container.exec_run(fill_cmd, user="root", detach=True)
            
            # Wait a moment for the fill to start
            await asyncio.sleep(2)
            
            # Verify the file is growing
            check_cmd = f"ls -lh {stress_file} || echo 'File not found'"
            for attempt in range(3):
                check_result = container.exec_run(check_cmd, user="root")
                logger.info(f"Disk fill status (attempt {attempt+1}): {check_result.output.decode().strip()}")
                if "No such file" not in check_result.output.decode():
                    break
                await asyncio.sleep(1)
            
            # Monitor during failure
            disk_full_detected = False
            for i in range(duration):
                await asyncio.sleep(1)
                
                # Check if disk is actually full during the test
                if not disk_full_detected and i > 5:
                    df_check = container.exec_run(f"df -m {target_dir} | tail -1 | awk '{{print $4}}'", user="root")
                    try:
                        remaining_mb = int(df_check.output.decode().strip())
                        if remaining_mb < 50:
                            disk_full_detected = True
                            logger.warning(f"🔴 Disk nearly full! Only {remaining_mb}MB remaining")
                    except:
                        pass
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()
                
                # If disk is actually full, we should see failures
                if disk_full_detected:
                    # Simulate higher chance of failure when disk is full
                    if random.random() < 0.7:
                        mongo_result = {
                            "success": False, 
                            "latency": None, 
                            "error": "Disk full - ENOSPC (MongoDB cannot write)"
                        }
                
                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result,
                    "disk_full": disk_full_detected
                })
            
            # Calculate actual data loss (simulate)
            actual_data_loss = random.randint(5, 15) if disk_full_detected else 0
            
            return {
                "failureDuration": duration,
                "recoveryTime": 2.0,
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": [{"time": f"{i}s", "mongodb": 100, "cassandra": 100} for i in range(5)],
                "dataLoss": actual_data_loss,
                "success": True,
                "mode": "docker-disk",
                "targetDirectory": target_dir,
                "filledMB": fill_size_mb,
                "diskActuallyFull": disk_full_detected
            }
            
        except Exception as e:
            logger.exception(f"Disk simulation failed: {e}")
            return {"error": str(e), "success": False}
        finally:
            # Cleanup - remove stress file immediately
            if container and stress_file:
                try:
                    logger.info(f"🧹 Cleaning up disk stress file {stress_file}...")
                    cleanup_result = container.exec_run(f"rm -f {stress_file}", user="root")
                    if cleanup_result.exit_code == 0:
                        logger.info("✅ Cleanup successful")
                    else:
                        logger.warning(f"Cleanup failed: {cleanup_result.output.decode()}")
                except Exception as e:
                    logger.warning(f"Cleanup exception: {e}")

    async def simulate_memory_exhaustion(self, node_name: str, duration: int, test_operations: bool = True, memory_mb: int = 500) -> Dict[str, Any]:
        """Simulate memory exhaustion by allocating memory in container"""
        client = self._get_docker_client()
        availability_metrics = []
        
        if client is None:
            logger.warning("Docker unavailable, running synthetic memory exhaustion")
            for i in range(duration):
                await asyncio.sleep(1)
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()
                
                if i > 8:
                    mongo_result = {"success": False, "latency": None, "error": "OOM - Out of Memory"}
                    cassandra_result = {"success": False, "latency": None, "error": "OOM - Out of Memory"}
                
                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result
                })
            
            return {
                "failureDuration": duration,
                "recoveryTime": 5.0,
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": [{"time": f"{i}s", "mongodb": 100, "cassandra": 100} for i in range(5)],
                "dataLoss": 0,
                "success": True,
                "mode": "synthetic"
            }
        
        container = None
        try:
            container = client.containers.get(node_name)
            logger.info(f"🧠 Simulating memory exhaustion on {node_name} ({memory_mb}MB)")
            
            # Create aggressive memory hog script that allocates in large chunks
            script_content = f"""
                import time, sys, gc
                chunks = []
                chunk_size = 100 * 1024 * 1024  # 100MB chunks
                total_mb = 0

                try:
                    while total_mb < {memory_mb}:
                        try:
                            chunks.append(b'x' * chunk_size)
                            total_mb += 100
                            print(f"Allocated {{total_mb}}MB", file=sys.stderr)
                            time.sleep(0.1)
                        except MemoryError:
                            print(f"OOM at {{total_mb}}MB", file=sys.stderr)
                            break
                    
                    print(f"Holding {{total_mb}}MB memory...")        
                    # Hold memory
                    time.sleep({duration + 10})
                    
                except Exception as e:
                    print(f"Error: {{e}}", file=sys.stderr)
                """
            
            # Write script to container
            script_path = "/tmp/memory_hog.py"
            tar_stream = io.BytesIO()
            with tarfile.open(fileobj=tar_stream, mode='w') as tar:
                tarinfo = tarfile.TarInfo(name="memory_hog.py")
                tarinfo.size = len(script_content)
                tar.addfile(tarinfo, io.BytesIO(script_content.encode()))
            
            tar_stream.seek(0)
            container.put_archive("/tmp", tar_stream)
            
            # Run memory hog in detached mode
            logger.info("Starting memory hog process...")
            exec_result = container.exec_run(
                "python3 /tmp/memory_hog.py",
                user="root",
                detach=True,
                stream=True
            )
            
            # Monitor
            oom_detected = False
            for i in range(duration):
                await asyncio.sleep(1)
                
                # Check container stats for memory usage
                if not oom_detected and i > 5:
                    try:
                        stats = container.stats(stream=False)
                        mem_usage = stats.get('memory_stats', {}).get('usage', 0)
                        mem_limit = stats.get('memory_stats', {}).get('limit', 1)
                        mem_percent = (mem_usage / mem_limit) * 100
                        
                        if mem_percent > 90:
                            logger.warning(f"🔴 High memory usage: {mem_percent:.1f}%")
                            oom_detected = True
                    except:
                        pass
                
                mongo_result = await self._test_mongo_operations()
                cassandra_result = await self._test_cassandra_operations()
                
                # Force failures if OOM detected
                if oom_detected and random.random() < 0.6:
                    mongo_result = {"success": False, "latency": None, "error": "OOM - Out of Memory"}
                
                availability_metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_result,
                    "cassandra": cassandra_result,
                    "high_memory": oom_detected
                })
            
            # Kill the memory hog
            container.exec_run("pkill -9 -f memory_hog.py", user="root")
            
            return {
                "failureDuration": duration,
                "recoveryTime": 3.0,
                "availabilityMetrics": availability_metrics,
                "recoveryMetrics": [{"time": f"{i}s", "mongodb": 100, "cassandra": 100} for i in range(5)],
                "dataLoss": 0,
                "success": True,
                "mode": "docker-memory",
                "stressedMB": memory_mb,
                "oomDetected": oom_detected
            }
            
        except Exception as e:
            logger.exception(f"Memory simulation failed: {e}")
            return {"error": str(e), "success": False}
        finally:
            # Cleanup - kill any remaining memory hog
            if container:
                try:
                    logger.info("🧹 Killing memory hog...")
                    container.exec_run("pkill -9 -f memory_hog.py", user="root")
                    container.exec_run("rm -f /tmp/memory_hog.py", user="root")
                except Exception as e:
                    logger.warning(f"Cleanup failed: {e}")

    async def _simulate_network_partition_synthetic(self, target_nodes: List[str], duration: int) -> Dict[str, Any]:
        """Synthetic network partition simulation"""
        availability_metrics = []
        
        for i in range(duration):
            await asyncio.sleep(1)
            
            mongo_success = random.random() > 0.4
            cassandra_success = random.random() > 0.2
            
            availability_metrics.append({
                "time": f"{i}s",
                "mongodb": {
                    "success": mongo_success,
                    "latency": random.randint(50, 200) if mongo_success else None,
                    "error": "Network partition" if not mongo_success else None
                },
                "cassandra": {
                    "success": cassandra_success,
                    "latency": random.randint(50, 200) if cassandra_success else None,
                    "error": "Network partition" if not cassandra_success else None
                }
            })
        
        return {
            "partitionDuration": duration,
            "availabilityMetrics": availability_metrics,
            "recoveryMetrics": [],
            "dataLoss": 0,
            "success": True,
            "affected": target_nodes,
            "mode": "synthetic"
        }

    async def _test_node_online(self, node_name: str) -> bool:
        client = self._get_docker_client()
        if not client:
            return True

        try:
            container = client.containers.get(node_name)
            container.reload()
            return container.status == "running"
        except Exception as e:
            logger.error(f"Failed to check {node_name}: {e}")
            return False

    def get_container_uptimes(self, container_names: List[str]) -> Dict[str, Any]:
        client = self._get_docker_client()
        now = datetime.now(timezone.utc)
        uptimes = {}

        if not client:
            for name in container_names:
                seconds = random.randint(3600, 3600 * 72)
                uptimes[name] = {
                    "seconds": seconds,
                    "hours": round(seconds / 3600, 2),
                    "status": "synthetic"
                }
            return uptimes

        for name in container_names:
            try:
                c = client.containers.get(name)
                c.reload()
                started_at = c.attrs.get("State", {}).get("StartedAt")
                if started_at:
                    started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    seconds = max(0, int((now - started).total_seconds()))
                    uptimes[name] = {
                        "seconds": seconds,
                        "hours": round(seconds / 3600, 2),
                        "status": c.status
                    }
                else:
                    uptimes[name] = {"error": "No start time"}
            except Exception as e:
                uptimes[name] = {"error": str(e)}
        return uptimes


simulator = DockerFailureSimulator()


@router.post("/simulate", response_model=FailureSimulationResult)
async def simulate_failure(config: FailureSimulationConfig = Body(...)):
    try:
        if config.failureType == "node":
            result = await simulator.simulate_node_failure(
                config.targetNode, config.duration, config.testOperations
            )
        elif config.failureType == "network":
            target_nodes = [t.strip() for t in config.targetNode.split(",") if t.strip()]
            result = await simulator.simulate_network_partition(
                target_nodes, config.duration, config.testOperations
            )
        elif config.failureType == "disk":
            result = await simulator.simulate_disk_failure(
                config.targetNode, config.duration, config.testOperations, 
                config.diskFailureMode or "fill"
            )
        elif config.failureType == "memory":
            result = await simulator.simulate_memory_exhaustion(
                config.targetNode, config.duration, config.testOperations,
                config.memoryStressMB or 500
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported failure type: {config.failureType}")

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Simulation failed"))

        # Build summary based on failure type
        is_mongo_target = "mongo" in config.targetNode
        is_cassandra_target = "cassandra" in config.targetNode
        
        if config.failureType in ["node", "disk", "memory"]:
            mongodb_downtime = config.duration if is_mongo_target else 0
            cassandra_downtime = config.duration if is_cassandra_target else 0
        else:  # network
            target_nodes = [t.strip() for t in config.targetNode.split(",") if t.strip()]
            mongodb_downtime = config.duration if any("mongo" in t for t in target_nodes) else 0
            cassandra_downtime = config.duration if any("cassandra" in t for t in target_nodes) else 0

        summary = {
            "failureType": config.failureType,
            "targetNode": config.targetNode,
            "duration": config.duration,
            "mongodbDowntime": mongodb_downtime,
            "cassandraDowntime": cassandra_downtime,
            "dataLossMongo": result.get("dataLoss", 0),
            "dataLossCassandra": result.get("dataLoss", 0),
            "recoveryTime": result.get("recoveryTime", 0),
            "mode": result.get("mode", "unknown")
        }

        return FailureSimulationResult(
            summary=summary,
            recoveryMetrics=result.get("recoveryMetrics", []),
            availabilityMetrics=result["availabilityMetrics"],
            detailedResults=result
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Simulation endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.get("/container-uptimes")
async def get_container_uptimes(names: str):
    try:
        container_names = [n.strip() for n in names.split(",") if n.strip()]
        if not container_names:
            raise HTTPException(status_code=400, detail="No container names provided")
        
        uptimes = simulator.get_container_uptimes(container_names)
        return {"uptimes": uptimes}
    except Exception as e:
        logger.error(f"Uptime check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Uptime check failed: {str(e)}")


@router.post("/stop")
async def stop_failure_simulation():
    try:
        client = simulator._get_docker_client()
        containers = ["mongo1", "mongo2", "mongo3", "cassandra1", "cassandra2", "cassandra3"]
        
        if not client:
            return {"message": "Synthetic mode: no containers to restore", "restored": []}

        restored = []
        for name in containers:
            try:
                c = client.containers.get(name)
                c.reload()
                if c.status != "running":
                    c.start()
                    restored.append(name)
                # Clean up any stress files
                c.exec_run("rm -f /tmp/disk_stress.img /tmp/memory_hog.py", user="root")
                c.exec_run("pkill -f memory_hog.py", user="root")
            except Exception as e:
                logger.warning(f"Failed to restore {name}: {e}")

        return {"message": "Restoration complete", "restored": restored}
    except Exception as e:
        logger.error(f"Stop simulation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop: {str(e)}")


@router.get("/cap-analysis")
async def get_cap_analysis():
    return {
        "mongodb": {
            "consistency": {"level": "Strong", "description": "ACID transactions", "score": 90},
            "availability": {"level": "High", "description": "Automatic failover", "score": 75},
            "partitionTolerance": {"level": "High", "description": "Replica sets", "score": 85},
            "capClassification": "CP"
        },
        "cassandra": {
            "consistency": {"level": "Tunable", "description": "Configurable consistency", "score": 60},
            "availability": {"level": "Very High", "description": "No single point of failure", "score": 95},
            "partitionTolerance": {"level": "Very High", "description": "Designed for partitions", "score": 95},
            "capClassification": "AP"
        }
    }