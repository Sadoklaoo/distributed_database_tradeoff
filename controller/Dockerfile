FROM python:3.11-slim-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential libssl-dev python3-dev \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["bash", "-c", "\
    echo '⏳ Waiting for Cassandra...' && \
    until python3 -c \"from cassandra.cluster import Cluster; Cluster(['cassandra1','cassandra2','cassandra3']).connect()\" 2>/dev/null; do \
        echo '⏳ Cassandra not ready...'; sleep 5; \
    done && \
    echo '✅ Cassandra ready!' && \
    echo '⏳ Waiting for MongoDB...' && \
    until python3 -c \"import pymongo; pymongo.MongoClient('mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0').admin.command('ping')\" 2>/dev/null; do \
        echo '⏳ MongoDB not ready...'; sleep 5; \
    done && \
    echo '✅ MongoDB ready!' && \
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload"]