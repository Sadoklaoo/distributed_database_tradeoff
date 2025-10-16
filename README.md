# Distributed Databases Tradeoff Analysis

A comparative analysis system for distributed databases using Cassandra and MongoDB, with a React frontend for visualization and a FastAPI backend for database operations.

## Architecture

### Database Clusters
- **MongoDB**: 3-node replica set (rs0)
  - Automatic failover
  - Ports: 27017-27019
  - Initialized via `scripts/rs-init.js`

- **Cassandra**: 3-node cluster (TestCluster)
  - Single DC (dc1) / Single Rack (rack1)
  - Port: 9042
  - SimpleStrategy replication

### API Layer (FastAPI)
- REST endpoints for both databases
- Async MongoDB operations
- Cassandra operations with schema management
- Swagger UI documentation

### Frontend (React)
- Dashboard for cluster monitoring
- Database operation interface
- Served via Nginx

## Project Structure
```
distributed_database_tradeoff/
├── controller/                # FastAPI backend
│   ├── app/
│   │   ├── routes/
│   │   │   ├── mongo_routes.py
│   │   │   ├── cassandra_routes.py
│   │   │   ├── performance_routes.py
│   │   │   └── failure_routes.py
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
│   └── rs-init.js           # MongoDB replica set init
├── data/                    # Persisted data (gitignored)
│   ├── mongo1/
│   ├── mongo2/
│   ├── mongo3/
│   ├── cassandra1/
│   ├── cassandra2/
│   └── cassandra3/
└── docker-compose.yml
```

## Quick Start

1. Start all services:
```bash
docker compose up -d --build
```

2. Access the applications:
- Frontend Dashboard: http://localhost:5173
- API Documentation: http://localhost:8000/docs
- API Health Check: http://localhost:8000/api/health

3. Verify cluster status:
```bash
# MongoDB replica set
docker compose exec mongo1 mongosh --eval "rs.status()"

# Cassandra ring
docker compose exec cassandra1 nodetool status
```

## API Endpoints

### Health & Status
```http
GET /api/health
GET /api/mongo/status
GET /api/cassandra/status
```

### MongoDB Operations
```http
POST /api/mongo/insert?collection={name}
POST /api/mongo/find?collection={name}
PUT /api/mongo/update?collection={name}
DELETE /api/mongo/delete?collection={name}
```

### Cassandra Operations
```http
POST /api/cassandra/insert?table={name}
POST /api/cassandra/find?table={name}
PUT /api/cassandra/update?table={name}
DELETE /api/cassandra/delete?table={name}
```

## Development

### Local Backend Development
```bash
# Start databases only
docker compose up -d mongo1 mongo2 mongo3 cassandra1 cassandra2 cassandra3

# Install dependencies
cd controller
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run FastAPI with hot reload
uvicorn main:app --reload
```

### Local Frontend Development
```bash
cd web
npm install
npm run dev
```

## Environment Variables

### Controller
```env
MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/testDB?replicaSet=rs0
MONGO_DB=testDB
CASSANDRA_KEYSPACE=testkeyspace
CASSANDRA_CONTACT_POINTS=cassandra1,cassandra2,cassandra3
```

### Frontend
```env
VITE_API_BASE=/api
```

## Future Improvements

1. Add Cassandra initialization CQL scripts
2. Implement comprehensive test suite
   - Unit tests for clients
   - Integration tests for API
   - Performance benchmarks
3. Add monitoring and metrics collection
4. Implement failure simulation endpoints
5. Add database comparison visualizations

## License

MIT