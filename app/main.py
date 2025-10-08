# controller/main.py
import os
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.routes.mongo_routes import router as mongo_router
from app.routes.cassandra_routes import router as cassandra_router
from app.mongo_client import MongoDBClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo1:27017")
MONGO_DB = os.getenv("MONGO_DB", "testDB")

mongo_client = MongoDBClient(uri=MONGO_URI, db_name=MONGO_DB)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await mongo_client.connect()
    print("✅ MongoDB connection established on startup")
    yield
    # Shutdown
    if mongo_client:
        mongo_client.close()
        print("🔌 MongoDB connection closed")

app = FastAPI(title="Controller API", version="1.0.0", lifespan=lifespan)

# Include routes
app.include_router(mongo_router, prefix="/api/mongo", tags=["MongoDB Operations"])
app.include_router(cassandra_router, prefix="/api/cassandra", tags=["Cassandra Operations"])
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Controller API is running!"}
