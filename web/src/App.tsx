import React, { useEffect, useState } from 'react';

type Health = { status: string; message?: string };
type CassandraStatus = {
  local: { host_id: string; data_center: string | null; rack: string | null; broadcast_address: string | null };
  peers: Array<{ peer: string; data_center: string | null; host_id: string | null; rpc_address: string | null }>;
};

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const App: React.FC = () => {
  const [controllerHealth, setControllerHealth] = useState<Health | null>(null);
  const [mongoPing, setMongoPing] = useState<any>(null);
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [cassandraStatus, setCassandraStatus] = useState<CassandraStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Mongo CRUD state
  const [mongoCollection, setMongoCollection] = useState('devices');
  const [mongoDocument, setMongoDocument] = useState('{"name": "Device A", "status": "active"}');
  const [mongoFilter, setMongoFilter] = useState('{"status": "active"}');
  const [mongoResults, setMongoResults] = useState<any[]>([]);
  const [mongoError, setMongoError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [health, ping, mstatus, cstatus] = await Promise.all([
          fetchJson<Health>('/api/health'),
          fetchJson<any>('/api/mongo/ping'),
          fetchJson<any>('/api/mongo/status'),
          fetchJson<CassandraStatus>('/api/cassandra/status'),
        ]);
        setControllerHealth(health);
        setMongoPing(ping);
        setMongoStatus(mstatus);
        setCassandraStatus(cstatus);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      }
    })();
  }, []);

  const handleMongoInsert = async () => {
    try {
      setMongoError(null);
      const doc = JSON.parse(mongoDocument);
      const result = await fetchJson(`/api/mongo/insert?collection=${mongoCollection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      console.log('Insert result:', result);
      alert('Document inserted successfully!');
    } catch (e: any) {
      setMongoError(e.message);
    }
  };

  const handleMongoFind = async () => {
    try {
      setMongoError(null);
      const filter = JSON.parse(mongoFilter);
      const results = await fetchJson<any[]>(`/api/mongo/find?collection=${mongoCollection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter })
      });
      setMongoResults(results);
    } catch (e: any) {
      setMongoError(e.message);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Distributed Databases Dashboard</h1>
        <p>MongoDB Replica Set + Cassandra Cluster</p>
      </header>

      {error && <div className="card error">{error}</div>}

      <section className="grid">
        <div className="card">
          <h2>Controller</h2>
          <pre>{JSON.stringify(controllerHealth, null, 2)}</pre>
        </div>

        <div className="card">
          <h2>MongoDB Ping</h2>
          <pre>{JSON.stringify(mongoPing, null, 2)}</pre>
        </div>

        <div className="card">
          <h2>MongoDB Status</h2>
          <pre>{JSON.stringify(mongoStatus, null, 2)}</pre>
        </div>

        <div className="card">
          <h2>Cassandra Status</h2>
          <pre>{JSON.stringify(cassandraStatus, null, 2)}</pre>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>MongoDB Insert</h2>
          <div className="form-group">
            <label>Collection:</label>
            <input 
              type="text" 
              value={mongoCollection} 
              onChange={(e) => setMongoCollection(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Document (JSON):</label>
            <textarea 
              value={mongoDocument} 
              onChange={(e) => setMongoDocument(e.target.value)}
              rows={3}
            />
          </div>
          <button onClick={handleMongoInsert} className="btn">Insert Document</button>
        </div>

        <div className="card">
          <h2>MongoDB Find</h2>
          <div className="form-group">
            <label>Collection:</label>
            <input 
              type="text" 
              value={mongoCollection} 
              onChange={(e) => setMongoCollection(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Filter (JSON):</label>
            <textarea 
              value={mongoFilter} 
              onChange={(e) => setMongoFilter(e.target.value)}
              rows={2}
            />
          </div>
          <button onClick={handleMongoFind} className="btn">Find Documents</button>
        </div>
      </section>

      {mongoError && <div className="card error">MongoDB Error: {mongoError}</div>}

      {mongoResults.length > 0 && (
        <section>
          <div className="card">
            <h2>MongoDB Results ({mongoResults.length} documents)</h2>
            <pre>{JSON.stringify(mongoResults, null, 2)}</pre>
          </div>
        </section>
      )}
    </div>
  );
};


