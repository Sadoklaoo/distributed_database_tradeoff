import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Eye, Download } from 'lucide-react';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const PerformanceHistory: React.FC = () => {
  const [reports, setReports] = useState<string[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<string[]>('/api/report/');
      setReports(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const viewReport = async (filename: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/report/${filename}`);
      const text = await res.text();
      setSelectedReport(filename);
      setReportContent(text);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1>
          <FileText className="w-8 h-8" />
          Performance Reports
        </h1>
        <p>History of generated performance tests</p>
      </header>

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <h2>Available Reports ({reports.length})</h2>
          <button onClick={loadReports} className="btn btn-secondary">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="error">Error: {error}</p>}

        <div className="table-container-full">
          <table className="table-full">
            <thead>
              <tr>
                <th>#</th>
                <th>Filename</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((file, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="font-mono text-xs">{file}</td>
                  <td>
                    {file.match(/\d{8}_\d{6}/)
                      ? file.match(/\d{8}_\d{6}/)![0]
                      : 'N/A'}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewReport(file)}
                        className="btn-icon btn-icon-view"
                        title="View report"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <a
                        href={`/api/report/${file}`}
                        className="btn-icon btn-icon-download"
                        title="Download"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReport && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{selectedReport}</h2>
              <button onClick={() => setSelectedReport(null)} className="btn-icon">
                ×
              </button>
            </div>
            <div className="modal-body">
              <pre className="text-sm whitespace-pre-wrap">{reportContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
