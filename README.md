## Distributed Databases Tradeoff Analysis

A comparative analysis system for distributed databases using **Cassandra** and **MongoDB**, featuring a **React frontend** for visualization and a **FastAPI backend** for database operations, logging, and performance benchmarking.

## 🏗️ Architecture

### **Database Clusters**
- **MongoDB**: 3-node replica set (`rs0`)
  - Automatic failover
  - Ports: 27017–27019
  - Initialized via `scripts/rs-init.js`
- **Cassandra**: 3-node cluster (`TestCluster`)
  - Single DC (`dc1`) / Single Rack (`rack1`)
  - Port: 9042
  - `SimpleStrategy` replication
  - Keyspace **`testkeyspace`** auto-created at startup

### **Backend (FastAPI)**
- REST API for MongoDB and Cassandra CRUD operations
- Asynchronous operations for optimal I/O handling
- Built-in **performance testing system**:
  - Measures **latency**, **throughput**, and per-operation metrics (`insert`, `read`, `update`)
  - Generates **Markdown** and **JSON** reports automatically
- Centralized **logging utilities** with async execution and optional tqdm progress bars
- Integrated **Swagger UI** documentation for all endpoints

### **Frontend (React)**
- Dashboard for monitoring cluster status and metrics
- Interface for database operations and performance test execution
- Served through **Nginx** in Docker

## 📁 Project Structure
```bash
distributed_database_tradeoff/
├── controller/                # FastAPI backend
│   ├── app/
│   │   ├── routes/
│   │   │   ├── mongo_routes.py
│   │   │   ├── cassandra_routes.py
│   │   │   ├── performance_routes.py  # Performance endpoints
│   │   │   ├── report_routes.py       # Report management endpoints
│   │   │   └── failure_routes.py
│   │   ├── models/
│   │   │   └── performance_test_models.py
│   │   ├── utils/
│   │   │   ├── logger_utils.py        # Logging + tqdm helpers
│   │   │   └── report_utils.py        # Report saving + management
│   │   ├── mongo_client.py
│   │   └── cassandra_client.py
│   ├── main.py
│   └── Dockerfile
├── web/                      # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.tsx
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/                  # Initialization scripts
│   └── rs-init.js            # MongoDB replica set init
├── logs/                     # Auto-generated performance reports
│   └── performance_reports/
├── data/                     # Persisted data (gitignored)
│   ├── mongo1/ ... mongo3/
│   └── cassandra1/ ... cassandra3/
└── docker-compose.yml
```

## 🚀 Quick Start

### **1. Start All Services**
```bash
docker compose up -d --build
```

### **2. Access Applications**
- Frontend Dashboard → [http://localhost:5173](http://localhost:5173)
- API Docs (Swagger) → [http://localhost:8000/docs](http://localhost:8000/docs)
- API Health Check → [http://localhost:8000/api/health](http://localhost:8000/api/health)

### **3. Verify Cluster Status**
```bash
# MongoDB replica set
docker compose exec mongo1 mongosh --eval "rs.status()"

# Cassandra ring
docker compose exec cassandra1 nodetool status
```

## 🔗 API Endpoints

### **Health & Status**
```http
GET /api/health
GET /api/mongo/status
GET /api/cassandra/status
```

### **MongoDB Operations**
```http
POST /api/mongo/insert?collection={name}
POST /api/mongo/find?collection={name}
PUT  /api/mongo/update?collection={name}
DELETE /api/mongo/delete?collection={name}
```

### **Cassandra Operations**
```http
POST /api/cassandra/insert?table={name}
POST /api/cassandra/find?table={name}
PUT  /api/cassandra/update?table={name}
DELETE /api/cassandra/delete?table={name}
```

### **Performance Testing & Reports**
```http
POST /api/performance/run          # Run MongoDB + Cassandra performance tests
POST /api/performance/cleanup      # Cleanup test data in both databases
GET  /api/performance/test-latency?db=mongo|cassandra  # Quick latency simulation
GET  /api/report/                  # List all generated reports
GET  /api/report/{filename}        # Download specific report
GET  /api/report/latest            # Fetch the most recent report
```
- Reports stored in: `logs/performance_reports/`
- Formats: `.md` (Markdown) & `.json`
- Metrics include latency per operation and throughput summary

## 🧩 Development

### **Local Backend Development**
```bash
# Start only databases
docker compose up -d mongo1 mongo2 mongo3 cassandra1 cassandra2 cassandra3

# Install dependencies
cd controller
python -m venv venv
source venv/bin/activate  # or .\\venv\\Scripts\\activate on Windows
pip install -r requirements.txt

# Run FastAPI with hot reload
uvicorn main:app --reload
```

### **Local Frontend Development**
```bash
cd web
npm install
npm run dev
```

## ⚙️ Environment Variables

### **Controller (.env)**
```env
MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/testDB?replicaSet=rs0
MONGO_DB=testDB
CASSANDRA_KEYSPACE=testkeyspace
CASSANDRA_CONTACT_POINTS=cassandra1,cassandra2,cassandra3
```

### **Frontend (.env)**
```env
VITE_API_BASE=/api
```

## 🔮 Future Improvements

1. Add Cassandra initialization CQL scripts
2. Implement full test suite (unit, integration, performance)
3. Add metrics visualization dashboard
4. Implement advanced failure simulation
5. Enable external report export via API or UI

## 📜 License

MIT License

