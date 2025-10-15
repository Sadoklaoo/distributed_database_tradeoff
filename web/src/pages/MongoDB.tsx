import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  BarChart3, 
  Cpu,
  XCircle,
  Database
} from 'lucide-react';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const MongoDB: React.FC = () => {
  const [mongoCollection, setMongoCollection] = useState('devices');
  const [mongoDocument, setMongoDocument] = useState('{"name": "Device A", "status": "active", "type": "sensor", "location": "Building A"}');
  const [mongoFilter, setMongoFilter] = useState('{"status": "active"}');
  const [mongoResults, setMongoResults] = useState<any[]>([]);
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [mongoLoading, setMongoLoading] = useState(false);

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
          <Database className="w-8 h-8" />
          MongoDB Operations
        </h1>
        <p>Document-based database operations and queries</p>
      </header>

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
