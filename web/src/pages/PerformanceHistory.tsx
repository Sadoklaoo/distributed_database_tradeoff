// src/pages/PerformanceHistory.tsx
import React, { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, Eye, Download } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

type ReportsMeta = Record<string, any>;

export const PerformanceHistory: React.FC = () => {
  const [reports, setReports] = useState<string[]>([]);
  const [reportsMeta, setReportsMeta] = useState<ReportsMeta>({});
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDateFromFilename = (filename: string) => {
    const match = filename.match(/(\d{8})_(\d{6})/);
    if (!match) return "N/A";
    const [_, datePart, timePart] = match;
    const dt = new Date(
      `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(
        6,
        8
      )}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(
        4,
        6
      )}Z`
    );
    return dt.toLocaleString();
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const files = await fetchJson<string[]>("/api/report/");
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      setReports(jsonFiles);

      // fetch metadata (config) in parallel
      const meta: ReportsMeta = {};
      await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const json = await fetchJson<any>(`/api/report/${file}`);
            meta[file] = json.config || {};
          } catch {
            meta[file] = {};
          }
        })
      );
      setReportsMeta(meta);
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
      const json = await fetchJson<any>(`/api/report/${filename}`);
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

  // Helper: build badge classname using the same style tokens you already use in CSS
  const renderBadge = (type: "consistency" | "operation", value?: string) => {
    const v = (value || "N/A").toString().toLowerCase();
    const classes =
      type === "consistency"
        ? v === "strong"
          ? "status-badge consistency-strong"
          : v === "eventual"
          ? "status-badge consistency-eventual"
          : v === "session"
          ? "status-badge consistency-session"
          : "status-badge consistency-unknown"
        : // operation
        v === "read"
        ? "status-badge operation-read"
        : v === "write"
        ? "status-badge operation-write"
        : v === "update"
        ? "status-badge operation-update"
        : v === "mixed"
        ? "status-badge operation-mixed"
        : "status-badge operation-other";

    return <span className={classes}>{(value || "N/A").toString().toUpperCase()}</span>;
  };

  // Utility: average
  const avg = (arr?: number[]) => {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  };

  // Prepare modal charts data (memoized)
  const groupedLatencyData = useMemo(() => {
    if (!reportData) return [];
    const ops = ["insert", "read", "update"];
    return ops.map((op) => ({
      operation: op.toUpperCase(),
      mongodb: +(avg(reportData.mongo?.latencies?.[op]) || 0).toFixed(5),
      cassandra: +(avg(reportData.cassandra?.latencies?.[op]) || 0).toFixed(5)
    }));
  }, [reportData]);

  const throughputAndErrorsData = useMemo(() => {
    if (!reportData) return [];
    return [
      {
        db: "MongoDB",
        throughput: +(reportData.mongo?.throughput || 0).toFixed(3),
        errors: reportData.mongo?.errors || 0
      },
      {
        db: "Cassandra",
        throughput: +(reportData.cassandra?.throughput || 0).toFixed(3),
        errors: reportData.cassandra?.errors || 0
      }
    ];
  }, [reportData]);

  // Create combined latency series (line chart) - take up to N samples from each DB's concatenated arrays
  const latencySeries = useMemo(() => {
    if (!reportData) return [];
    const MAX_POINTS = 80;
    // concat insert/read/update samples for each DB (preserve original order)
    const mSamples = [
      ...(reportData.mongo?.latencies?.insert || []),
      ...(reportData.mongo?.latencies?.read || []),
      ...(reportData.mongo?.latencies?.update || [])
    ].slice(0, MAX_POINTS);
    const cSamples = [
      ...(reportData.cassandra?.latencies?.insert || []),
      ...(reportData.cassandra?.latencies?.read || []),
      ...(reportData.cassandra?.latencies?.update || [])
    ].slice(0, MAX_POINTS);

    const length = Math.max(mSamples.length, cSamples.length);
    if (length === 0) return [];

    const data = [];
    for (let i = 0; i < length; i++) {
      data.push({
        index: i + 1,
        mongo: typeof mSamples[i] === "number" ? +mSamples[i].toFixed(6) : null,
        cassandra: typeof cSamples[i] === "number" ? +cSamples[i].toFixed(6) : null
      });
    }
    return data;
  }, [reportData]);

  // Pie chart for health (if available) - fallback to throughput ratio if no health info
  const healthPieData = useMemo(() => {
    if (!reportData) return [];
    // prefer explicit counts if they exist
    const mongoHealthyCount = reportData.mongo?.healthyCount ?? null;
    const mongoUnhealthyCount = reportData.mongo?.unhealthyCount ?? null;
    if (typeof mongoHealthyCount === "number" && typeof mongoUnhealthyCount === "number") {
      return [
        { name: "Mongo Healthy", value: mongoHealthyCount, color: "#00d4ff" },
        { name: "Mongo Unhealthy", value: mongoUnhealthyCount, color: "#ff4444" }
      ];
    }
    // fallback: convert throughput to two slices so it still shows something meaningful
    const m = reportData.mongo?.throughput || 0;
    const c = reportData.cassandra?.throughput || 0;
    const total = m + c;
    if (total === 0) return [{ name: "No Activity", value: 1, color: "#888" }];
    return [
      { name: "Mongo Throughput", value: m, color: "#00d4ff" },
      { name: "Cassandra Throughput", value: c, color: "#00ff88" }
    ];
  }, [reportData]);

  // Tooltip formatter (consistent look)
  const tooltipStyle = {
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    padding: 8
  } as React.CSSProperties;

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2>Available Reports ({reports.length})</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadReports} className="btn btn-secondary">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
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
                <th>Consistency</th>
                <th>Operation Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((file, i) => (
                <tr key={file}>
                  <td>{i + 1}</td>
                  <td className="font-mono text-xs">{file}</td>
                  <td>{formatDateFromFilename(file)}</td>
                  <td>{renderBadge("consistency", reportsMeta[file]?.consistencyLevel)}</td>
                  <td>{renderBadge("operation", reportsMeta[file]?.testType)}</td>
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
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="no-data">
                    No reports found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {selectedReport && reportData && (
        <div className="modal-overlay">
          <div className="modal max-w-4xl" style={{ width: "95%", maxWidth: 1100 }}>
            <div className="modal-header">
              <h2>{selectedReport}</h2>
              <button onClick={() => { setSelectedReport(null); setReportData(null); }} className="btn-icon">
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Config summary + badges */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {renderBadge("consistency", reportData.config?.consistencyLevel)}
                  {renderBadge("operation", reportData.config?.testType)}
                </div>
                <div style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                  <div>Operation Count: <strong>{reportData.config?.operationCount ?? "N/A"}</strong></div>
                  <div>Batch Size: <strong>{reportData.config?.batchSize ?? "N/A"}</strong></div>
                </div>
              </div>

              {/* Top metrics cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div className="metric-card">
                  <div className="metric-value">{reportData.mongo?.throughput?.toFixed?.(3) ?? (reportData.mongo?.throughput ?? 0)}</div>
                  <div className="metric-label">MongoDB Throughput (ops/sec)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{reportData.cassandra?.throughput?.toFixed?.(3) ?? (reportData.cassandra?.throughput ?? 0)}</div>
                  <div className="metric-label">Cassandra Throughput (ops/sec)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{(reportData.mongo?.errors ?? 0)}</div>
                  <div className="metric-label">MongoDB Errors</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{(reportData.cassandra?.errors ?? 0)}</div>
                  <div className="metric-label">Cassandra Errors</div>
                </div>
              </div>

              {/* Charts area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ marginBottom: 12 }}>
                <div className="card chart-card" style={{ padding: 12 }}>
                  <h3 style={{ marginBottom: 8 }}>Avg Latency per Operation (ms)</h3>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupedLatencyData} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="operation" stroke="#a0a0a0" />
                        <YAxis stroke="#a0a0a0" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Bar dataKey="mongodb" name="MongoDB (ms)" fill="#00d4ff" />
                        <Bar dataKey="cassandra" name="Cassandra (ms)" fill="#00ff88" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card chart-card" style={{ padding: 12 }}>
                  <h3 style={{ marginBottom: 8 }}>Throughput & Errors</h3>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={throughputAndErrorsData} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="db" stroke="#a0a0a0" />
                        <YAxis stroke="#a0a0a0" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Bar dataKey="throughput" name="Throughput (ops/sec)" fill="#00d4ff" />
                        <Bar dataKey="errors" name="Errors" fill="#ff4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Latency series sparkline */}
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Latency samples (combined)</h3>
                <p style={{ color: "var(--text-muted)", marginTop: -6 }}>Concatenated insert/read/update samples — shows distribution and spikes</p>
                <div style={{ height: 200 }}>
                  {latencySeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={latencySeries} margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="index" stroke="#a0a0a0" />
                        <YAxis stroke="#a0a0a0" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="mongo" stroke="#00d4ff" dot={false} />
                        <Line type="monotone" dataKey="cassandra" stroke="#00ff88" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="no-data">No latency samples available</div>
                  )}
                </div>
              </div>

              {/* Health / Pie (fallback) */}
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Health / Throughput Split</h3>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthPieData}
                        dataKey="value"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={4}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {healthPieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Raw JSON and details */}
              <div style={{ marginTop: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Raw report</h3>
                <pre className="json-display" style={{ maxHeight: 300, overflowY: "auto" }}>
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

export default PerformanceHistory;
