import React, { useEffect, useState } from 'react';

type Health = { status: string; message?: string };
type CassandraStatus = {
  local: { host_id: string; data_center: string | null; rack: string | null; broadcast_address: string | null };
  peers: Array<{ peer: string; data_center: string | null; host_id: string | null; rpc_address: string | null }>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const App: React.FC = () => {
  const [controllerHealth, setControllerHealth] = useState<Health | null>(null);
  const [mongoPing, setMongoPing] = useState<any>(null);
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [cassandraStatus, setCassandraStatus] = useState<CassandraStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
};


