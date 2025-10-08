# Distributed Databases Tradeoff

This project explores tradeoffs in distributed databases using Cassandra and MongoDB. It uses Docker Compose to orchestrate multi-node clusters for both databases, with custom scripts for initialization and consistency testing. A Python FastAPI controller exposes REST APIs for cluster health and database operations.

## Folder Structure

```
controller/
  app/
    main.py                # FastAPI app entrypoint
    routes/
      mongo_routes.py      # MongoDB API endpoints
      cassandra_routes.py  # Cassandra API endpoints
    mongo_client.py        # Async MongoDB client
    utils.py               # BSON-to-JSON serialization
  Dockerfile               # Controller service build
mongo_scripts/             # MongoDB JS test scripts
cassandra_data1/           # Cassandra node 1 data
cassandra_data2/           # Cassandra node 2 data
cassandra_data3/           # Cassandra node 3 data
mongo_data1/               # MongoDB node 1 data
mongo_data2/               # MongoDB node 2 data
mongo_data3/               # MongoDB node 3 data
init-replica.sh            # Replica initialization script
check_cassandra_cluster.sh # Cassandra health check
check_cassandra_cluster_summary.sh # Cassandra summary check
docker-compose.yml         # Cluster orchestration
.github/
  copilot-instructions.md  # AI coding agent instructions
.gitignore                 # Git ignore rules
```

## Quickstart

1. **Start clusters:**
   ```sh
   docker-compose up -d
   ```
2. **Initialize replicas:**
   ```sh
   bash init-replica.sh
   ```
3. **Check Cassandra cluster:**
   ```sh
   bash check_cassandra_cluster.sh
   ```
4. **Run MongoDB test:**
   ```sh
   mongo mongo_scripts/mongo_test_script.js
   ```
5. **Access API endpoints:**
   ```sh
   curl http://localhost:8000/api/mongo/status
   curl http://localhost:8000/api/mongo/ping
   ```

## API Endpoints

- `/api/mongo/status` – MongoDB replica set status
- `/api/mongo/ping` – MongoDB ping
- `/api/health` – Controller health check

## Conventions

- All MongoDB operations in Python use async/await via Motor.
- BSON results are serialized using `bson_to_json_compatible` from `utils.py`.
- Data directories are node-specific and excluded from version control.
- Environment variables (`MONGO_URI`, `CASSANDRA_CONTACT_POINTS`) are set via Docker Compose.

## License

MIT 
