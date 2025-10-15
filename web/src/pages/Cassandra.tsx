import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  BarChart3, 
  Cpu,
  XCircle,
  HardDrive
} from 'lucide-react';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const Cassandra: React.FC = () => {
  const [cassandraTable, setCassandraTable] = useState('devices');
  const [cassandraDocument, setCassandraDocument] = useState('{"id": "uuid-here", "name": "Device A", "status": "active", "type": "sensor"}');
  const [cassandraFilter, setCassandraFilter] = useState('{"status": "active"}');
  const [cassandraResults, setCassandraResults] = useState<any[]>([]);
  const [cassandraError, setCassandraError] = useState<string | null>(null);
  const [cassandraLoading, setCassandraLoading] = useState(false);

  const handleCassandraInsert = async () => {
    try {
      setCassandraError(null);
      setCassandraLoading(true);
      const doc = JSON.parse(cassandraDocument);
      const result = await fetchJson(`/api/cassandra/insert?table=${cassandraTable}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      console.log('Insert result:', result);
      await handleCassandraFind();
    } catch (e: any) {
      setCassandraError(e.message);
    } finally {
      setCassandraLoading(false);
    }
  };

  const handleCassandraFind = async () => {
    try {
      setCassandraError(null);
      setCassandraLoading(true);
      const filter = JSON.parse(cassandraFilter);
      const results = await fetchJson<any[]>(`/api/cassandra/find?table=${cassandraTable}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filter })
      });
      setCassandraResults(results);
    } catch (e: any) {
      setCassandraError(e.message);
    } finally {
      setCassandraLoading(false);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ok':
      case 'online':
      case 'up':
      case 'active':
        return 'online';
      case 'error':
      case 'offline':
      case 'down':
      case 'inactive':
        return 'offline';
      default:
        return 'warning';
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>
          <HardDrive className="w-8 h-8" />
          Cassandra Operations
        </h1>
        <p>Wide-column database operations and queries</p>
      </header>

      <section className="grid">
        <div className="card">
          <h2>
            <Plus className="w-6 h-6" />
            Insert Row
          </h2>
          <div className="form-group">
            <label>Table Name</label>
            <input 
              type="text" 
              value={cassandraTable} 
              onChange={(e) => setCassandraTable(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Row Data (JSON)</label>
            <textarea 
              value={cassandraDocument} 
              onChange={(e) => setCassandraDocument(e.target.value)}
              rows={4}
              placeholder='{"id": "uuid-here", "name": "Device A", "status": "active"}'
            />
          </div>
          <button 
            onClick={handleCassandraInsert} 
            className="btn"
            disabled={cassandraLoading}
          >
            {cassandraLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {cassandraLoading ? 'Inserting...' : 'Insert Row'}
          </button>
        </div>

        <div className="card">
          <h2>
            <Search className="w-6 h-6" />
            Find Rows
          </h2>
          <div className="form-group">
            <label>Table Name</label>
            <input 
              type="text" 
              value={cassandraTable} 
              onChange={(e) => setCassandraTable(e.target.value)}
              placeholder="devices"
            />
          </div>
          <div className="form-group">
            <label>Filter (JSON)</label>
            <textarea 
              value={cassandraFilter} 
              onChange={(e) => setCassandraFilter(e.target.value)}
              rows={3}
              placeholder='{"status": "active"}'
            />
          </div>
          <button 
            onClick={handleCassandraFind} 
            className="btn"
            disabled={cassandraLoading}
          >
            {cassandraLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {cassandraLoading ? 'Searching...' : 'Find Rows'}
          </button>
        </div>
      </section>

      {cassandraError && (
        <div className="error">
          <XCircle className="w-5 h-5 inline mr-2" />
          Cassandra Error: {cassandraError}
        </div>
      )}

      {cassandraResults.length > 0 && (
        <section>
          <div className="card">
            <h2>
              <BarChart3 className="w-6 h-6" />
              Query Results ({cassandraResults.length} rows)
            </h2>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {cassandraResults.map((row, index) => (
                    <tr key={index}>
                      <td>{row.id || 'N/A'}</td>
                      <td>{row.name || 'N/A'}</td>
                      <td>
                        <span className={`status ${getStatusClass(row.status || '')}`}>
                          {row.status || 'N/A'}
                        </span>
                      </td>
                      <td>{row.type || 'N/A'}</td>
                      <td>{new Date().toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {cassandraResults.length > 0 && (
        <section>
          <div className="card">
            <h2>
              <Cpu className="w-6 h-6" />
              Raw JSON Response
            </h2>
            <div className="json-display">
              {JSON.stringify(cassandraResults, null, 2)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
