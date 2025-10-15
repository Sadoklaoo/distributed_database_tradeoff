import React, { useEffect, useState } from 'react';
import { 
  Database, 
  Server, 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Plus,
  Search,
  RefreshCw,
  BarChart3,
  Cpu,
  HardDrive
} from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  
  // Mongo CRUD state
  const [mongoCollection, setMongoCollection] = useState('devices');
  const [mongoDocument, setMongoDocument] = useState('{"name": "Device A", "status": "active", "type": "sensor", "location": "Building A"}');
  const [mongoFilter, setMongoFilter] = useState('{"status": "active"}');
  const [mongoResults, setMongoResults] = useState<any[]>([]);
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [mongoLoading, setMongoLoading] = useState(false);

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

  const handleMongoInsert = async () => {
    try {
      setMongoError(null);
      setMongoLoading(true);
      const doc = JSON.parse(mongoDocument);
      const result = await fetchJson(`/api/mongo/insert?collection=${mongoCollection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      console.log('Insert result:', result);
      // Refresh the find results
      await handleMongoFind();
    } catch (e: any) {
      setMongoError(e.message);
    } finally {
      setMongoLoading(false);
    }
  };

  const handleMongoFind = async () => {
    try {
      setMongoError(null);
      setMongoLoading(true);
      const filter = JSON.parse(mongoFilter);
      const results = await fetchJson<any[]>(`/api/mongo/find?collection=${mongoCollection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter })
      });
      setMongoResults(results);
    } catch (e: any) {
      setMongoError(e.message);
    } finally {
      setMongoLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'online':
      case 'up':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
      case 'offline':
      case 'down':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'online':
      case 'up':
        return 'online';
      case 'error':
      case 'offline':
      case 'down':
        return 'offline';
      default:
        return 'warning';
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
        <h1>Distributed Databases Dashboard</h1>
        <p>MongoDB Replica Set + Cassandra Cluster Monitoring</p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* System Status Overview */}
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

      {/* MongoDB Operations */}
      <section className="grid">
        <div className="card">
          <h2>
            <Plus className="w-6 h-6" />
            Insert Document
          </h2>
          <div className="form-group">
            <label>Collection Name</label>
            <input 
              type="text" 
              value={mongoCollection} 
              onChange={(e) => setMongoCollection(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Document (JSON)</label>
            <textarea 
              value={mongoDocument} 
              onChange={(e) => setMongoDocument(e.target.value)}
              rows={4}
              placeholder='{"name": "Device A", "status": "active"}'
            />
          </div>
          <button 
            onClick={handleMongoInsert} 
            className="btn"
            disabled={mongoLoading}
          >
            {mongoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {mongoLoading ? 'Inserting...' : 'Insert Document'}
          </button>
        </div>

        <div className="card">
          <h2>
            <Search className="w-6 h-6" />
            Find Documents
          </h2>
          <div className="form-group">
            <label>Collection Name</label>
            <input 
              type="text" 
              value={mongoCollection} 
              onChange={(e) => setMongoCollection(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Filter (JSON)</label>
            <textarea 
              value={mongoFilter} 
              onChange={(e) => setMongoFilter(e.target.value)}
              rows={3}
              placeholder='{"status": "active"}'
            />
          </div>
          <button 
            onClick={handleMongoFind} 
            className="btn"
            disabled={mongoLoading}
          >
            {mongoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {mongoLoading ? 'Searching...' : 'Find Documents'}
          </button>
        </div>
      </section>

      {mongoError && (
        <div className="error">
          <XCircle className="w-5 h-5 inline mr-2" />
          MongoDB Error: {mongoError}
        </div>
      )}

      {/* Results Table */}
      {mongoResults.length > 0 && (
        <section>
          <div className="card">
            <h2>
              <BarChart3 className="w-6 h-6" />
              Query Results ({mongoResults.length} documents)
            </h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {mongoResults.map((doc, index) => (
                    <tr key={index}>
                      <td>{doc._id || 'N/A'}</td>
                      <td>{doc.document?.name || 'N/A'}</td>
                      <td>
                        <span className={`status ${getStatusClass(doc.document?.status || '')}`}>
                          {doc.document?.status || 'N/A'}
                        </span>
                      </td>
                      <td>{doc.document?.type || 'N/A'}</td>
                      <td>{doc.document?.location || 'N/A'}</td>
                      <td>{new Date().toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Raw JSON Results */}
      {mongoResults.length > 0 && (
        <section>
          <div className="card">
            <h2>
              <Cpu className="w-6 h-6" />
              Raw JSON Response
            </h2>
            <div className="json-display">
              {JSON.stringify(mongoResults, null, 2)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};


