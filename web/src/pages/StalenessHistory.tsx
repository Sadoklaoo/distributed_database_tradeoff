import React, { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, Eye, Download, Gauge } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// ── helpers ──────────────────────────────────────────────────────────────────

const formatDateFromFilename = (filename: string) => {
  const match = filename.match(/(\d{8})_(\d{6})/);
  if (!match) return "N/A";
  const [_, datePart, timePart] = match;
  const dt = new Date(
    `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}` +
    `T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}Z`
  );
  return dt.toLocaleString();
};

const renderConsistencyBadge = (value?: string) => {
  const v = (value || "N/A").toUpperCase();
  const color =
    v === "ONE" ? "#ffd93d" : v === "QUORUM" ? "#00ff88" : v === "ALL" ? "#00d4ff" : "#888";
  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: "2px 10px",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {v}
    </span>
  );
};

const renderReadTargetBadge = (secondary?: boolean) => {
  const label = secondary ? "SECONDARY" : "PRIMARY";
  const color = secondary ? "#ff6b6b" : "#00d4ff";
  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: "2px 10px",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {label}
    </span>
  );
};

const tooltipStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  color: "#fff",
} as React.CSSProperties;

// ── component ─────────────────────────────────────────────────────────────────

export const StalenessHistory: React.FC = () => {
  const [reports, setReports] = useState<string[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const files = await fetchJson<string[]>("/api/staleness/reports");
      setReports(files);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const viewReport = async (filename: string) => {
    try {
      setLoading(true);
      setError(null);
      const json = await fetchJson<any>(`/api/staleness/reports/${filename}`);
      setSelectedReport(filename);
      setReportData(json);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  // ── modal chart data ────────────────────────────────────────────────────────

  const latencyChartData = useMemo(() => {
    if (!reportData) return [];
    return [
      {
        metric: "Mean",
        MongoDB: reportData.mongodb?.mean_ms ?? 0,
        Cassandra: reportData.cassandra?.mean_ms ?? 0,
      },
      {
        metric: "Median",
        MongoDB: reportData.mongodb?.median_ms ?? 0,
        Cassandra: reportData.cassandra?.median_ms ?? 0,
      },
      {
        metric: "P95",
        MongoDB: reportData.mongodb?.p95_ms ?? 0,
        Cassandra: reportData.cassandra?.p95_ms ?? 0,
      },
      {
        metric: "P99",
        MongoDB: reportData.mongodb?.p99_ms ?? 0,
        Cassandra: reportData.cassandra?.p99_ms ?? 0,
      },
      {
        metric: "Max",
        MongoDB: reportData.mongodb?.max_ms ?? 0,
        Cassandra: reportData.cassandra?.max_ms ?? 0,
      },
    ];
  }, [reportData]);

  const staleRatioData = useMemo(() => {
    if (!reportData) return [];
    return [
      {
        db: "MongoDB",
        "Stale %": +((reportData.mongodb?.stale_ratio ?? 0) * 100).toFixed(1),
      },
      {
        db: "Cassandra",
        "Stale %": +((reportData.cassandra?.stale_ratio ?? 0) * 100).toFixed(1),
      },
    ];
  }, [reportData]);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="container">
      <header className="header">
        <h1>
          <FileText className="w-8 h-8" />
          Staleness Reports
        </h1>
        <p>History of staleness measurement runs (RQ2)</p>
      </header>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
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
                <th>Cassandra CL</th>
                <th>Mongo Read</th>
                <th>Iterations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((file, i) => (
                <tr key={file}>
                  <td>{i + 1}</td>
                  <td className="font-mono text-xs">{file}</td>
                  <td>{formatDateFromFilename(file)}</td>
                  {/* We don't have metadata without fetching — show filename-derived info */}
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => viewReport(file)}
                        className="btn-icon btn-icon-view"
                        title="View report"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <a
                        href={`/api/staleness/reports/${file}`}
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
              {reports.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="no-data">
                    No staleness reports found. Run a measurement first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {selectedReport && reportData && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "95%", maxWidth: 1100 }}>
            <div className="modal-header">
              <h2>{selectedReport}</h2>
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setReportData(null);
                }}
                className="btn-icon"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* config summary */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                {renderConsistencyBadge(reportData.config?.consistency)}
                {renderReadTargetBadge(reportData.config?.mongo_read_secondary)}
                <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
                  {reportData.config?.iterations} iterations ·{" "}
                  {reportData.config?.write_delay_ms} ms delay ·{" "}
                  {new Date(reportData.completed_at).toLocaleString()}
                </span>
              </div>

              {/* metric cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div className="metric-card">
                  <div className="metric-value" style={{ color: "#00ff88" }}>
                    {reportData.cassandra?.mean_ms?.toFixed(3)} ms
                  </div>
                  <div className="metric-label">Cassandra Mean Staleness</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ color: "#00d4ff" }}>
                    {reportData.mongodb?.mean_ms?.toFixed(3)} ms
                  </div>
                  <div className="metric-label">MongoDB Mean Staleness</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ color: "#00ff88" }}>
                    {((reportData.cassandra?.stale_ratio ?? 0) * 100).toFixed(1)}%
                  </div>
                  <div className="metric-label">Cassandra Stale Ratio</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value" style={{ color: "#00d4ff" }}>
                    {((reportData.mongodb?.stale_ratio ?? 0) * 100).toFixed(1)}%
                  </div>
                  <div className="metric-label">MongoDB Stale Ratio</div>
                </div>
              </div>

              {/* charts */}
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                style={{ marginBottom: 12 }}
              >
                <div className="card chart-card" style={{ padding: 12 }}>
                  <h3 style={{ marginBottom: 8 }}>Staleness Distribution (ms)</h3>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={latencyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="metric" stroke="#a0a0a0" />
                        <YAxis stroke="#a0a0a0" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Bar dataKey="MongoDB" fill="#00d4ff" />
                        <Bar dataKey="Cassandra" fill="#00ff88" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card chart-card" style={{ padding: 12 }}>
                  <h3 style={{ marginBottom: 8 }}>Stale Read Ratio (%)</h3>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={staleRatioData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="db" stroke="#a0a0a0" />
                        <YAxis
                          stroke="#a0a0a0"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v: any) => [`${v}%`, "Stale Ratio"]}
                        />
                        <Bar dataKey="Stale %" fill="#ffd93d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* raw JSON */}
              <div style={{ marginTop: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Raw Report</h3>
                <pre
                  className="json-display"
                  style={{ maxHeight: 300, overflowY: "auto" }}
                >
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StalenessHistory;