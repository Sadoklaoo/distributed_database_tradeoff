## Distributed Databases Tradeoff Analysis

A comparative analysis system for distributed databases using **Cassandra** and **MongoDB**, featuring a **React frontend** for visualization and a **FastAPI backend** for database operations, logging, performance benchmarking, and reliability simulations.

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
- Performance testing + staleness and recovery benchmarking
- Failure simulation (node stop, network partition, disk/memory stress)
- Centralized logging utilities with async execution and optional tqdm progress bars
- Integrated **Swagger UI** documentation for all endpoints

### **Frontend (React + Vite)**
- Dashboard for monitoring cluster status and metrics
- Visualization of live metrics, throughput, latency, and health
- Served via **Nginx** in Docker (production) or Vite dev server (local)

## 📁 Project Structure
```bash
distributed_database_tradeoff/
├── controller/                # FastAPI backend
│   ├── app/
│   │   ├── routes/
│   │   │   ├── cassandra_routes.py
│   │   │   ├── mongo_routes.py
│   │   │   ├── dashboard.py
│   │   │   ├── performance_routes.py
│   │   │   ├── report_routes.py
│   │   │   ├── staleness_routes.py
│   │   │   ├── recovery_benchmark.py
│   │   │   └── failure_routes.py
│   │   ├── mongo_client.py
│   │   ├── cassandra_client.py
│   │   └── utils/
│   ├── main.py
│   └── Dockerfile
├── web/                      # React frontend (Vite)
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/                  # Initialization scripts
│   └── rs-init.js            # MongoDB replica set init
├── logs/                     # Auto-generated reports
│   ├── performance_reports/
│   └── staleness_reports/
├── data/                     # Persisted database data (gitignored)
│   ├── mongo1/ ... mongo3/
│   └── cassandra1/ ... cassandra3/
└── docker-compose.yml
```

## 🚀 Quick Start (Docker)

### 1) Start all services
```bash
docker compose up -d --build
```

### 2) Open the apps
- Frontend Dashboard → http://localhost:5173
- API Docs (Swagger) → http://localhost:8000/docs
- API Health Check → http://localhost:8000/api/health

### 3) Verify cluster health
```bash
# MongoDB replica set
docker compose exec mongo1 mongosh --eval "rs.status()"

# Cassandra ring
docker compose exec cassandra1 nodetool status
```

## 🧪 API Endpoints

### Health & Status
- `GET /api/health`
- `GET /api/mongo/status`
- `GET /api/cassandra/status`
- `GET /api/dashboard/summary` (used by the frontend dashboard)

### MongoDB CRUD
- `POST /api/mongo/insert?collection={name}`
- `POST /api/mongo/find?collection={name}`
- `PUT  /api/mongo/update?collection={name}`
- `DELETE /api/mongo/delete?collection={name}`

### Cassandra CRUD
- `POST /api/cassandra/insert?table={name}`
- `POST /api/cassandra/find?table={name}`
- `PUT  /api/cassandra/update?table={name}`
- `DELETE /api/cassandra/delete?table={name}`

### Performance Testing & Reports
- `POST /api/performance/run` – Run performance tests (MongoDB + Cassandra)
- `POST /api/performance/cleanup` – Cleanup test data
- `GET  /api/performance/test-latency?db=mongo|cassandra` – Quick latency check
- `GET  /api/report/` – List reports
- `GET  /api/report/{filename}` – Download report
- `GET  /api/report/latest` – Latest report- `GET  /api/report/metrics/latest` – Latest performance report metrics (throughput + latency)
Reports are stored under `logs/performance_reports/` in both `.md` and `.json` formats.

### Staleness Measurement
- `POST /api/staleness/run` – Run staleness benchmark (MongoDB + Cassandra) and save results
- Results are stored under `logs/staleness_reports/`.

### Failure Simulation & Recovery
- `POST /api/failure/simulate` – Simulate failure modes (node stop, network partition, disk/memory stress)
- `POST /api/failure/stop` – Stop simulation and restore containers
- `GET  /api/failure/container-uptimes?names=mongo1,cassandra1` – Get container uptime metrics
- `GET  /api/failure/cap-analysis` – CAP theorem comparison summary
- `POST /api/benchmark/recovery-benchmark` – Measure recovery time after a node restart

## 🧩 Development (Local)

### Backend (FastAPI)
```bash
# Start only the databases
docker compose up -d mongo1 mongo2 mongo3 cassandra1 cassandra2 cassandra3

cd controller
python -m venv venv
# macOS / Linux
source venv/bin/activate
# Windows (PowerShell)
# .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run FastAPI with hot reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (React + Vite)
```bash
cd web
npm install
npm run dev
```

## ⚙️ Environment Variables

### Controller (optional `.env`)
```env
MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/testDB?replicaSet=rs0
MONGO_DB=testDB
CASSANDRA_KEYSPACE=testkeyspace
CASSANDRA_CONTACT_POINTS=cassandra1,cassandra2,cassandra3
```

### Frontend (optional `.env`)
```env
VITE_API_BASE=/api
```

## 🧹 Cleanup

Stop all containers:
```bash
docker compose down
```

Remove persisted database state (will reset clusters):
```bash
rm -rf data/mongo* data/cassandra*
```

## 🔮 Future Improvements

1. Add Cassandra initialization CQL scripts
2. Expand automated test suite (unit, integration, performance)
3. Add more detailed metric visualizations (staleness, availability, failure recovery)
4. Improve failure simulation UI and exportable reports

## 📜 License

MIT License

