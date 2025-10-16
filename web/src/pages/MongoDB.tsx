import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  BarChart3, 
  Cpu,
  XCircle,
  Database,
  Edit,
  Trash2,
  Save,
  X
} from 'lucide-react';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const MongoDB: React.FC = () => {
  const [mongoCollection, setMongoCollection] = useState('devices');
  const [mongoDocument, setMongoDocument] = useState('{"name": "Device A", "status": "ACTIVE", "type": "sensor", "location": "Building A"}');
  const [mongoFilter, setMongoFilter] = useState('{"status": "ACTIVE"}');
  const [mongoResults, setMongoResults] = useState<any[]>([]);
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [mongoLoading, setMongoLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDocument, setEditDocument] = useState<string>('');

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

  const handleMongoUpdate = async (id: string) => {
    try {
      setMongoError(null);
      setMongoLoading(true);
      const doc = JSON.parse(editDocument);
      const result = await fetchJson(`/api/mongo/update?collection=${mongoCollection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filter: { _id: id }, 
          update: doc 
        })
      });
      console.log('Update result:', result);
      setEditingId(null);
      await handleMongoFind();
    } catch (e: any) {
      setMongoError(e.message);
    } finally {
      setMongoLoading(false);
    }
  };

  const handleMongoDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      setMongoError(null);
      setMongoLoading(true);
      const result = await fetchJson(`/api/mongo/delete?collection=${mongoCollection}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { _id: id } })
      });
      console.log('Delete result:', result);
      await handleMongoFind();
    } catch (e: any) {
      setMongoError(e.message);
    } finally {
      setMongoLoading(false);
    }
  };

  const startEdit = (doc: any) => {
    setEditingId(doc._id);
    setEditDocument(JSON.stringify(doc.document, null, 2));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDocument('');
  };

  const getStatusClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'OK':
      case 'ONLINE':
      case 'UP':
      case 'ACTIVE':
        return 'online';
      case 'ERROR':
      case 'OFFLINE':
      case 'DOWN':
      case 'INACTIVE':
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
            <div className="table-container-full">
              <table className="table-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mongoResults.map((doc, index) => (
                    <tr key={index}>
                      <td className="font-mono text-xs">{doc._id ? doc._id.substring(0, 8) + '...' : 'N/A'}</td>
                      <td className="font-medium">{doc.document?.name || 'N/A'}</td>
                      <td>
                        <span className={`status ${getStatusClass(doc.document?.status || '')}`}>
                          {doc.document?.status?.toUpperCase() || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{doc.document?.type || 'N/A'}</span>
                      </td>
                      <td className="text-muted">{doc.document?.location || 'N/A'}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(doc)}
                            className="btn-icon btn-icon-edit"
                            title="Edit document"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleMongoDelete(doc._id)}
                            className="btn-icon btn-icon-delete"
                            title="Delete document"
                            disabled={mongoLoading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Edit Modal */}
      {editingId && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>
                <Edit className="w-6 h-6" />
                Edit Document
              </h2>
              <button onClick={cancelEdit} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Document (JSON)</label>
                <textarea 
                  value={editDocument} 
                  onChange={(e) => setEditDocument(e.target.value)}
                  rows={8}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={cancelEdit} className="btn btn-secondary">
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button 
                onClick={() => handleMongoUpdate(editingId)} 
                className="btn"
                disabled={mongoLoading}
              >
                {mongoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {mongoLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
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
