import React, { useEffect, useState } from 'react';
import { 
  Server, 
  Database, 
  Activity, 
  HardDrive,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

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

export const Dashboard: React.FC = () => {
  const [controllerHealth, setControllerHealth] = useState<Health | null>(null);
  const [mongoPing, setMongoPing] = useState<any>(null);
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [cassandraStatus, setCassandraStatus] = useState<CassandraStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
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
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'online':
      case 'up':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner"></div>
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>System Dashboard</h1>
        <p>Real-time monitoring of distributed database clusters</p>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="grid">
        <div className="card">
          <h2>
            <Server className="w-6 h-6" />
            Controller Status
          </h2>
          <div className="status online">
            {getStatusIcon(controllerHealth?.status || '')}
            {controllerHealth?.status || 'Unknown'}
          </div>
          {controllerHealth && (
            <div className="mt-4">
              <div className="text-sm">
                <span className="text-muted">Message:</span>
                <div className="font-medium">{controllerHealth.message || 'No message'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <Database className="w-6 h-6" />
            MongoDB Health
          </h2>
          <div className="status online">
            {getStatusIcon('ok')}
            Connected
          </div>
          {mongoPing && (
            <div className="mt-4">
              <div className="text-sm">
                <span className="text-muted">Response Time:</span>
                <div className="font-medium">~{mongoPing.ok ? '1ms' : 'N/A'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <Activity className="w-6 h-6" />
            MongoDB Replica Set
          </h2>
          <div className="status online">
            {getStatusIcon('ok')}
            Active
          </div>
          {mongoStatus && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted">Set Name:</span>
                  <div className="font-medium">{mongoStatus.set || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-muted">Members:</span>
                  <div className="font-medium">{mongoStatus.members?.length || 0}</div>
                </div>
                <div>
                  <span className="text-muted">Primary:</span>
                  <div className="font-medium">{mongoStatus.primary || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-muted">State:</span>
                  <div className="font-medium">{mongoStatus.myState || 'N/A'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <HardDrive className="w-6 h-6" />
            Cassandra Cluster
          </h2>
          <div className="status online">
            {getStatusIcon('ok')}
            {cassandraStatus?.peers?.length || 0} peers
          </div>
          {cassandraStatus && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted">Data Center:</span>
                  <div className="font-medium">{cassandraStatus.local?.data_center || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-muted">Rack:</span>
                  <div className="font-medium">{cassandraStatus.local?.rack || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-muted">Peers:</span>
                  <div className="font-medium">{cassandraStatus.peers?.length || 0}</div>
                </div>
                <div>
                  <span className="text-muted">Host ID:</span>
                  <div className="font-medium text-xs truncate">{cassandraStatus.local?.host_id || 'N/A'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
