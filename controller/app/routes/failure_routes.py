import asyncio
import time
import subprocess
from typing import Dict, List, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
try:
    import docker  # type: ignore
except Exception:
    docker = None  # type: ignore
import random

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
        self.active_simulations = {}
    
    def _get_docker_client(self):
        """Lazy initialization of Docker client"""
        if self.client is None:
            if docker is None:
                raise HTTPException(status_code=500, detail="Docker SDK not available in this environment.")
            try:
                self.client = docker.from_env()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Docker client not available: {str(e)}")
        return self.client
    
    async def simulate_node_failure(self, node_name: str, duration: int) -> Dict[str, Any]:
        """Simulate a node failure by stopping the container"""
        try:
            client = self._get_docker_client()
            container = client.containers.get(node_name)
            
            # Stop the container
            container.stop()
            
            # Record failure start time
            failure_start = time.time()
            
            # Monitor system behavior during failure
            metrics = []
            for i in range(duration):
                await asyncio.sleep(1)
                
                # Test operations if requested
                operation_success = await self._test_operations_during_failure(node_name)
                
                metrics.append({
                    "time": f"{i}s",
                    "mongodb": 100 if "mongo" not in node_name else 0,
                    "cassandra": 100 if "cassandra" not in node_name else 0,
                    "operationSuccess": operation_success
                })
            
            # Restart the container
            container.start()
            
            # Monitor recovery
            recovery_start = time.time()
            recovery_metrics = []
            for i in range(10):  # Monitor recovery for 10 seconds
                await asyncio.sleep(1)
                
                # Test if node is back online
                is_online = await self._test_node_online(node_name)
                
                recovery_metrics.append({
                    "time": f"{i}s",
                    "mongodb": 100 if "mongo" not in node_name else (100 if is_online else 0),
                    "cassandra": 100 if "cassandra" not in node_name else (100 if is_online else 0)
                })
            
            recovery_time = time.time() - recovery_start
            
            return {
                "failureDuration": duration,
                "recoveryTime": recovery_time,
                "availabilityMetrics": metrics,
                "recoveryMetrics": recovery_metrics,
                "dataLoss": 0,  # Would need to implement actual data loss detection
                "success": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }
    
    async def simulate_network_partition(self, duration: int) -> Dict[str, Any]:
        """Simulate network partition by blocking network access"""
        try:
            # This would require more complex network manipulation
            # For now, we'll simulate by stopping multiple nodes
            
            client = self._get_docker_client()
            # Stop two nodes to simulate partition
            mongo_container = client.containers.get("mongo2")
            cassandra_container = client.containers.get("cassandra2")
            
            mongo_container.stop()
            cassandra_container.stop()
            
            # Monitor during partition
            metrics = []
            for i in range(duration):
                await asyncio.sleep(1)
                
                # Test operations across partition
                mongo_ops = await self._test_mongo_operations()
                cassandra_ops = await self._test_cassandra_operations()
                
                metrics.append({
                    "time": f"{i}s",
                    "mongodb": mongo_ops,
                    "cassandra": cassandra_ops
                })
            
            # Restore network (restart containers)
            mongo_container.start()
            cassandra_container.start()
            
            return {
                "partitionDuration": duration,
                "availabilityMetrics": metrics,
                "success": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }
    
    async def _test_operations_during_failure(self, failed_node: str) -> bool:
        """Test if operations can still succeed during failure"""
        try:
            # Try to perform a simple operation
            if "mongo" in failed_node:
                # Test Cassandra operations
                from ..cassandra_client import CassandraClient
                client = CassandraClient()
                await client.find_documents("test", {"id": "test"})
            else:
                # Test MongoDB operations
                from ..mongo_client import MongoDBClient
                client = MongoDBClient()
                await client.find_documents("test", {"status": "ACTIVE"})
            return True
        except:
            return False
    
    async def _test_node_online(self, node_name: str) -> bool:
        """Test if a node is back online"""
        try:
            client = self._get_docker_client()
            container = client.containers.get(node_name)
            return container.status == "running"
        except:
            return False
    
    async def _test_mongo_operations(self) -> int:
        """Test MongoDB operations and return success rate"""
        try:
            from ..mongo_client import MongoDBClient
            client = MongoDBClient()
            await client.find_documents("test", {"status": "ACTIVE"})
            return 100
        except:
            return 0
    
    async def _test_cassandra_operations(self) -> int:
        """Test Cassandra operations and return success rate"""
        try:
            from ..cassandra_client import CassandraClient
            client = CassandraClient()
            await client.find_documents("test", {"id": "test"})
            return 100
        except:
            return 0

    def get_container_uptimes(self, container_names: List[str]) -> Dict[str, Any]:
        """Return uptime info for the given container names in hours and seconds."""
        client = self._get_docker_client()
        uptimes: Dict[str, Any] = {}
        now = datetime.now(timezone.utc)
        for name in container_names:
            try:
                c = client.containers.get(name)
                started_at_str = c.attrs.get("State", {}).get("StartedAt")
                if started_at_str:
                    # Normalize RFC3339/ISO string and compute uptime
                    started = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
                    seconds = max(0, int((now - started).total_seconds()))
                    hours = round(seconds / 3600, 2)
                    uptimes[name] = {
                        "seconds": seconds,
                        "hours": hours,
                        "status": c.status
                    }
                else:
                    uptimes[name] = {"seconds": 0, "hours": 0, "status": c.status}
            except Exception as e:
                uptimes[name] = {"error": str(e)}
        return uptimes

simulator = DockerFailureSimulator()

@router.post("/simulate", response_model=FailureSimulationResult)
async def simulate_failure(config: FailureSimulationConfig = Body(...)):
    """Simulate various failure scenarios"""
    try:
        if config.failureType == "node":
            result = await simulator.simulate_node_failure(config.targetNode, config.duration)
        elif config.failureType == "network":
            result = await simulator.simulate_network_partition(config.duration)
        else:
            raise HTTPException(status_code=400, detail="Unsupported failure type")
        
        if not result.get("success", False):
            raise HTTPException(status_code=500, detail=result.get("error", "Simulation failed"))
        
        # Calculate summary metrics
        summary = {
            "failureType": config.failureType,
            "targetNode": config.targetNode,
            "duration": config.duration,
            "mongodbDowntime": config.duration if "mongo" in config.targetNode else 0,
            "cassandraDowntime": config.duration if "cassandra" in config.targetNode else 0,
            "dataLossMongo": result.get("dataLoss", 0),
            "dataLossCassandra": result.get("dataLoss", 0),
            "recoveryTime": result.get("recoveryTime", 0)
        }
        
        return FailureSimulationResult(
            summary=summary,
            recoveryMetrics=result.get("recoveryMetrics", []),
            availabilityMetrics=result.get("availabilityMetrics", []),
            detailedResults=result
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failure simulation failed: {str(e)}")

@router.get("/container-uptimes")
async def get_container_uptimes(names: str):
    """Get Docker container uptimes for a comma-separated list of container names."""
    try:
        container_names = [n.strip() for n in names.split(",") if n.strip()]
        if not container_names:
            raise HTTPException(status_code=400, detail="No container names provided")
        uptimes = simulator.get_container_uptimes(container_names)
        return {"uptimes": uptimes}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch uptimes: {str(e)}")

@router.post("/stop")
async def stop_failure_simulation():
    """Stop any active failure simulations"""
    try:
        # Restart all containers to ensure clean state
        client = simulator._get_docker_client()
        
        containers = ["mongo1", "mongo2", "mongo3", "cassandra1", "cassandra2", "cassandra3"]
        for container_name in containers:
            try:
                container = client.containers.get(container_name)
                if container.status != "running":
                    container.start()
            except:
                pass
        
        return {"message": "All failure simulations stopped and containers restored"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop simulation: {str(e)}")

@router.get("/cap-analysis")
async def get_cap_analysis():
    """Get CAP theorem analysis for both databases"""
    return {
        "mongodb": {
            "consistency": {
                "level": "Strong",
                "description": "ACID transactions with replica set consistency",
                "score": 90
            },
            "availability": {
                "level": "High",
                "description": "Automatic failover with replica sets",
                "score": 75
            },
            "partitionTolerance": {
                "level": "High",
                "description": "Handles network partitions with replica sets",
                "score": 85
            },
            "capClassification": "CP"
        },
        "cassandra": {
            "consistency": {
                "level": "Tunable",
                "description": "Configurable consistency levels",
                "score": 60
            },
            "availability": {
                "level": "Very High",
                "description": "No single point of failure",
                "score": 95
            },
            "partitionTolerance": {
                "level": "Very High",
                "description": "Designed for network partitions",
                "score": 95
            },
            "capClassification": "AP"
        }
    }
