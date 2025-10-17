# controller/main.py
import os
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.routes.mongo_routes import router as mongo_router
from app.routes.cassandra_routes import cassandra_router
from app.routes.performance_routes import router as performance_router
from app.routes.failure_routes import router as failure_router 
from app.routes.report_routes import router as report_router
from app.mongo_client import MongoDBClient
from fastapi.middleware.cors import CORSMiddleware

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

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["http://localhost:5173"] for stricter setup
    allow_credentials=True,
    allow_methods=["*"],  # ✅ Allows OPTIONS, POST, GET, etc.
    allow_headers=["*"],
)
# Include routes
app.include_router(mongo_router, prefix="/api/mongo", tags=["MongoDB Operations"])
app.include_router(cassandra_router, prefix="/api/cassandra", tags=["Cassandra Operations"])
app.include_router(performance_router, prefix="/api/performance", tags=["Performance Testing"])
app.include_router(failure_router, prefix="/api/failure", tags=["Failure Testing"])
app.include_router(report_router, prefix="/api/report", tags=["Report Generation"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Controller API is running!"}
