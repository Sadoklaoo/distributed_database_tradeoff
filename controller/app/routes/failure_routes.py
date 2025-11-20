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
    failureType: str = "node"
    targetNode: str = "mongo1"
    duration: int = 30
    testOperations: bool = True


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
            client.close()  # ✅ No await

    # --- Cassandra: Use run_in_executor + devices table ---
    async def _test_cassandra_operations(self) -> Dict[str, Any]:
        if CassandraClient is None:
            return {"success": False, "latency": None, "error": "CassandraClient not available"}

        client = CassandraClient(self.cassandra_keyspace, replication_factor=3)
        
        def _cassandra_task():
            try:
                start = time.time()
                # ✅ Use existing devices table with correct schema
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
        """
        TRUE network partition using Docker network disconnect/connect
        with verification that nodes are actually isolated.
        """
        client = self._get_docker_client()
        availability_metrics: List[Dict[str, Any]] = []
        
        if client is None:
            logger.warning("Docker unavailable, running synthetic network partition")
            return await self._simulate_network_partition_synthetic(target_nodes, duration)

        # --- CRITICAL: Get the EXACT network name ---
        # Your docker-compose.yml defines:
        # networks:
        #   db-network:
        #     driver: bridge
        #     name: distributed_db_network
        network_name = "distributed_db_network"
        
        # Try to get network, with fallback to inspect first container
        network = None
        try:
            network = client.networks.get(network_name)
            logger.info(f"✅ Found Docker network: {network_name}")
        except Exception as e:
            logger.error(f"❌ Network {network_name} not found: {e}")
            logger.info("🔍 Trying to inspect first container's network...")
            
            # Fallback: get network from first target container
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

        # --- Disconnect nodes ---
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

        # --- Monitor partition ---
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

        # --- Restore network ---
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

    async def _simulate_network_partition_synthetic(self, target_nodes: List[str], duration: int) -> Dict[str, Any]:
        """Synthetic network partition simulation"""
        availability_metrics = []
        
        for i in range(duration):
            await asyncio.sleep(1)
            
            # Simulate partial failures - some requests succeed, some fail
            mongo_success = random.random() > 0.4  # 60% chance of success
            cassandra_success = random.random() > 0.2  # 80% chance of success
            
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
            
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error", "Simulation failed"))

            mongodb_downtime = config.duration if "mongo" in config.targetNode else 0
            cassandra_downtime = config.duration if "cassandra" in config.targetNode else 0

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
                recoveryMetrics=result["recoveryMetrics"],
                availabilityMetrics=result["availabilityMetrics"],
                detailedResults=result
            )

        elif config.failureType == "network":
            target_nodes = [t.strip() for t in config.targetNode.split(",") if t.strip()]
            result = await simulator.simulate_network_partition(
                target_nodes, config.duration, config.testOperations
            )
            
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error", "Network partition failed"))

            mongodb_downtime = config.duration if any("mongo" in t for t in target_nodes) else 0
            cassandra_downtime = config.duration if any("cassandra" in t for t in target_nodes) else 0

            summary = {
                "failureType": "network",
                "targetNode": ",".join(target_nodes),
                "duration": config.duration,
                "mongodbDowntime": mongodb_downtime,
                "cassandraDowntime": cassandra_downtime,
                "dataLossMongo": 0,
                "dataLossCassandra": 0,
                "recoveryTime": 0,
                "mode": result.get("mode", "unknown")
            }

            return FailureSimulationResult(
                summary=summary,
                recoveryMetrics=result.get("recoveryMetrics", []),
                availabilityMetrics=result["availabilityMetrics"],
                detailedResults=result
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported failure type: {config.failureType}")

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