# Distributed Databases Tradeoff

This project explores tradeoffs in distributed databases using Cassandra and MongoDB. It uses Docker Compose to orchestrate multi-node clusters for both databases, with a React frontend dashboard and Python FastAPI controller exposing REST APIs for cluster health and database operations.

## Architecture

- **MongoDB**: 3-node replica set (rs0) with automatic failover
- **Cassandra**: 3-node cluster (TestCluster) with dc1/rack1 topology
- **Controller**: FastAPI backend with async MongoDB and Cassandra clients
- **Frontend**: React + TypeScript dashboard with Nginx reverse proxy

## Quickstart

1. **Start all services:**
   ```bash
   docker compose up -d --build
   ```

2. **Access the dashboard:**
   - Frontend: http://localhost:5173
   - API docs: http://localhost:8000/docs

3. **Verify cluster health:**
   ```bash
   # Check Cassandra ring
   docker compose exec cassandra1 nodetool status
   
   # Check MongoDB replica set
   docker compose exec mongo1 mongosh --eval "rs.status()"
   ```

## API Endpoints

### Health & Status
- `GET /api/health` – Controller health check
- `GET /api/mongo/ping` – MongoDB ping
- `GET /api/mongo/status` – MongoDB replica set status
- `GET /api/cassandra/status` – Cassandra cluster info
- `GET /api/cassandra/health` – Cassandra health check

### MongoDB CRUD
- `POST /api/mongo/insert?collection={name}` – Insert document
- `POST /api/mongo/find?collection={name}` – Find documents
- `PUT /api/mongo/update?collection={name}` – Update documents
- `DELETE /api/mongo/delete?collection={name}` – Delete documents

### Cassandra CRUD
- `POST /api/cassandra/insert?table={name}` – Insert row
- `POST /api/cassandra/find?table={name}` – Find rows
- `PUT /api/cassandra/update?table={name}` – Update rows
- `DELETE /api/cassandra/delete?table={name}` – Delete rows

## Frontend Features

The React dashboard provides:
- Real-time cluster health monitoring
- MongoDB document insert/find interface
- JSON response viewer for all API calls
- Responsive design with dark theme

## Development

### Local Development
```bash
# Backend only
docker compose up -d controller mongo1 mongo2 mongo3 cassandra1 cassandra2 cassandra3

# Frontend development server
cd web
npm install
npm run dev
```

### Production Build
```bash
# Build and run all services
docker compose up -d --build
```

## Project Structure

```
├── controller/           # FastAPI backend
│   ├── app/
│   │   ├── routes/      # API endpoints
│   │   ├── mongo_client.py
│   │   └── cassandra_client.py
│   ├── main.py
│   └── Dockerfile
├── web/                 # React frontend
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── data/               # Database volumes
│   ├── mongo1/ mongo2/ mongo3/
│   └── cassandra1/ cassandra2/ cassandra3/
├── scripts/
│   └── rs-init.js      # MongoDB replica set init
└── docker-compose.yml
```

## Environment Variables

- `MONGO_URI` – MongoDB connection string
- `MONGO_DB` – MongoDB database name
- `CASSANDRA_KEYSPACE` – Cassandra keyspace
- `CASSANDRA_CONTACT_POINTS` – Cassandra seed nodes

## License

MIT 
