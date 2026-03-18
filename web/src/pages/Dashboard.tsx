import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Server, Database, Activity, HardDrive,
  TrendingUp, Clock, Shield, RefreshCw, Timer
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

type Health = { status: string; message?: string };
type CassandraStatus = {
  local: {
    host_id: string;
    data_center: string | null;
    rack: string | null;
    broadcast_address: string | null;
  };
  peers: Array<{
    peer: string;
    data_center: string | null;
    host_id: string | null;
    rpc_address: string | null;
  }>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const Dashboard: React.FC = () => {
  const [controllerHealth, setControllerHealth] = useState<Health | null>(null);
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [cassandraStatus, setCassandraStatus] = useState<CassandraStatus | null>(null);
  const [containerUptimes, setContainerUptimes] = useState<
    Record<string, { hours: number; seconds: number; status: string }>
  >({});
  const [liveData, setLiveData] = useState<{
    timestamp: string;
    cpu: number;
    memory: number;
    mongo: { throughput: number | null; avg_latency: number | null };
    cassandra: { throughput: number | null; avg_latency: number | null };
  }>({
    timestamp: '',
    cpu: 0,
    memory: 0,
    mongo: { throughput: null, avg_latency: null },
    cassandra: { throughput: null, avg_latency: null },
  });
  const [liveChartData, setLiveChartData] = useState<
    Array<{ time: string; cpu: number; memory: number; requests: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastValues = useRef({
    mongo_throughput: 0,
    cassandra_throughput: 0,
    mongo_latency: 0,
    cassandra_latency: 0,
  });
  const reportMetricsRef = useRef<any>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<any>('/api/dashboard/summary');

      setControllerHealth(data.controller);
      setMongoStatus(data.mongo);
      setCassandraStatus(data.cassandra);
      setContainerUptimes(data.uptimes || {});

      // avg_latency from API is in seconds — convert to ms
      const liveMongoLatencyMs = data.liveMetrics.mongo.avg_latency != null
        ? data.liveMetrics.mongo.avg_latency * 1000
        : null;
      const liveCassLatencyMs = data.liveMetrics.cassandra.avg_latency != null
        ? data.liveMetrics.cassandra.avg_latency * 1000
        : null;

      // Try to fall back to the latest performance report if live metrics are not available
      let reportMetrics: any = null;
      try {
        reportMetrics = await fetchJson<any>('/api/report/metrics/latest');
      } catch {
        reportMetrics = null;
      }
      reportMetricsRef.current = reportMetrics;

      const pickMetric = (liveValue: number | null, reportValue: number | null) => {
        if (liveValue != null && liveValue > 0) return liveValue;
        if (reportValue != null && reportValue > 0) return reportValue;
        return liveValue ?? reportValue ?? 0;
      };

      const mongoThroughput = pickMetric(
        data.liveMetrics.mongo.throughput ?? null,
        reportMetrics?.mongo?.throughput ?? null
      );
      const cassandraThroughput = pickMetric(
        data.liveMetrics.cassandra.throughput ?? null,
        reportMetrics?.cassandra?.throughput ?? null
      );
      const mongoLatency = pickMetric(liveMongoLatencyMs, reportMetrics?.mongo?.avg_latency ?? null);
      const cassandraLatency = pickMetric(liveCassLatencyMs, reportMetrics?.cassandra?.avg_latency ?? null);

      setLiveData({
        timestamp: data.liveMetrics.timestamp,
        cpu: data.liveMetrics.cpu_percent,
        memory: data.liveMetrics.memory_percent,
        mongo: {
          throughput: mongoThroughput,
          avg_latency: mongoLatency,
        },
        cassandra: {
          throughput: cassandraThroughput,
          avg_latency: cassandraLatency,
        },
      });
      setLiveChartData([
        {
          time: new Date(data.liveMetrics.timestamp).toLocaleTimeString(),
          cpu: data.liveMetrics.cpu_percent,
          memory: data.liveMetrics.memory_percent,
          requests: mongoThroughput,
        },
      ]);
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadDashboard();

    liveInterval.current = setInterval(async () => {
      try {
        const live = await fetchJson<any>('/api/report/metrics/live');
        if (!mounted) return;

        const report = reportMetricsRef.current;
        const resolveMetric = (
          liveValue: number | null | undefined,
          lastValue: number,
          reportValue: number | null | undefined
        ) => {
          if (liveValue != null && liveValue > 0) return liveValue;
          if (lastValue > 0) return lastValue;
          if (reportValue != null && reportValue > 0) return reportValue;
          return liveValue ?? reportValue ?? lastValue ?? 0;
        };

        const safeMongoThroughput = resolveMetric(
          live.mongo?.throughput,
          lastValues.current.mongo_throughput,
          report?.mongo?.throughput
        );
        const safeCassThroughput = resolveMetric(
          live.cassandra?.throughput,
          lastValues.current.cassandra_throughput,
          report?.cassandra?.throughput
        );

        // API returns seconds — convert to ms
        const safeMongoLatency =
          resolveMetric(live.mongo?.avg_latency, lastValues.current.mongo_latency, report?.mongo?.avg_latency) * 1000;
        const safeCassLatency =
          resolveMetric(live.cassandra?.avg_latency, lastValues.current.cassandra_latency, report?.cassandra?.avg_latency) * 1000;

        setLiveData({
          timestamp: live.timestamp,
          cpu: live.cpu_percent,
          memory: live.memory.percent,
          mongo: { throughput: safeMongoThroughput, avg_latency: safeMongoLatency },
          cassandra: { throughput: safeCassThroughput, avg_latency: safeCassLatency },
        });

        lastValues.current = {
          mongo_throughput: safeMongoThroughput,
          cassandra_throughput: safeCassThroughput,
          mongo_latency: live.mongo?.avg_latency || lastValues.current.mongo_latency,
          cassandra_latency: live.cassandra?.avg_latency || lastValues.current.cassandra_latency,
        };

        setLiveChartData(prev => {
          const point = {
            time: new Date(live.timestamp).toLocaleTimeString(),
            cpu: live.cpu_percent,
            memory: live.memory.percent,
            requests: safeMongoThroughput,
          };
          return [...prev.slice(-19), point];
        });
      } catch (e) {
        console.error('Failed to fetch live metrics:', e);
      }
    }, 5000);

    return () => {
      mounted = false;
      if (liveInterval.current) clearInterval(liveInterval.current);
    };
  }, []);

  // ── derived data ──────────────────────────────────────────────────────────

  const responseTimeData = useMemo(
    () => [
      { database: 'MongoDB',   responseTime: liveData.mongo.avg_latency ?? 0 },
      { database: 'Cassandra', responseTime: liveData.cassandra.avg_latency ?? 0 },
    ],
    [liveData]
  );

  const throughputData = useMemo(
    () => [
      { database: 'MongoDB',   throughput: liveData.mongo.throughput ?? 0 },
      { database: 'Cassandra', throughput: liveData.cassandra.throughput ?? 0 },
    ],
    [liveData]
  );

  const mongoHealthData = useMemo(
    () => [
      {
        name: 'Healthy',
        value: mongoStatus?.members?.filter((m: any) => m.health === 1).length ?? 0,
        color: '#00ff88',
      },
      {
        name: 'Unhealthy',
        value: mongoStatus?.members?.filter((m: any) => m.health !== 1).length ?? 0,
        color: '#ff4444',
      },
    ],
    [mongoStatus]
  );

  const totalUptimeSeconds = useMemo(
    () =>
      Object.values(containerUptimes).reduce(
        (sum, v) => sum + (v.hours * 3600 + v.seconds),
        0
      ),
    [containerUptimes]
  );

  const formatUptime = (seconds: number) => {
    if (seconds === 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const chartsHaveData =
    (liveData.mongo.avg_latency ?? 0) > 0 ||
    (liveData.cassandra.avg_latency ?? 0) > 0 ||
    (liveData.mongo.throughput ?? 0) > 0 ||
    (liveData.cassandra.throughput ?? 0) > 0;

  const fmtLatency = (v: number | null) =>
    v && v > 0 ? `${v.toFixed(1)} ms` : '—';

  const fmtThroughput = (v: number | null) =>
    v && v > 0 ? v.toFixed(1) : '—';

  // ── loading ───────────────────────────────────────────────────────────────

  if (loading)
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          Loading dashboard...
        </div>
      </div>
    );

  // ── tables ────────────────────────────────────────────────────────────────

  const renderMongoTable = () => (
    <section className="table-section">
      <div className="table-card">
        <h2>
          <Database className="w-6 h-6" />
          MongoDB Replica Set Members
        </h2>
        {mongoStatus?.members?.length > 0 ? (
          <div className="table-container-full">
            <table className="table-full">
              <thead>
                <tr>
                  <th>Node Name</th>
                  <th>State</th>
                  <th>Health</th>
                  <th>Uptime</th>
                  <th>Last Heartbeat</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {mongoStatus.members.map((member: any, index: number) => (
                  <tr key={index}>
                    <td className="font-medium">
                      {member.name?.split(':')[0] || `Node ${index + 1}`}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          member.state === 1 ? 'primary' : member.state === 2 ? 'secondary' : 'other'
                        }`}
                      >
                        {member.state === 1 ? 'PRIMARY' : member.state === 2 ? 'SECONDARY' : 'OTHER'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${member.health === 1 ? 'healthy' : 'unhealthy'}`}>
                        {member.health === 1 ? 'HEALTHY' : 'UNHEALTHY'}
                      </span>
                    </td>
                    <td className="text-muted">
                      {member.uptime
                        ? `${Math.floor(member.uptime / 3600)}h ${Math.floor((member.uptime % 3600) / 60)}m`
                        : 'N/A'}
                    </td>
                    <td className="text-muted">
                      {member.lastHeartbeat
                        ? new Date(member.lastHeartbeat).toLocaleString('en-US', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : 'Active'}
                    </td>
                    <td className="text-muted">
                      {member.electionDate
                        ? `Elected: ${new Date(member.electionDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}`
                        : 'Default (1)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-data">No MongoDB replica set members data available</div>
        )}
      </div>
    </section>
  );

  const renderCassandraTable = () => {
    const localRow = cassandraStatus?.local
      ? {
          peer: cassandraStatus.local.broadcast_address ?? 'local',
          data_center: cassandraStatus.local.data_center,
          rack: 'rack1',
          host_id: cassandraStatus.local.host_id,
          rpc_address: cassandraStatus.local.broadcast_address,
          isLocal: true,
        }
      : null;

    const allNodes = [
      ...(localRow ? [localRow] : []),
      ...(cassandraStatus?.peers ?? []).map(p => ({ ...p, isLocal: false })),
    ];

    return (
      <section className="table-section">
        <div className="table-card">
          <h2>
            <HardDrive className="w-6 h-6" />
            Cassandra Cluster Nodes
          </h2>
          {allNodes.length > 0 ? (
            <div className="table-container-full">
              <table className="table-full">
                <thead>
                  <tr>
                    <th>Node Address</th>
                    <th>Role</th>
                    <th>Data Center</th>
                    <th>Rack</th>
                    <th>Host ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allNodes.map((node: any, index: number) => (
                    <tr key={index}>
                      <td className="font-medium">{node.peer || 'N/A'}</td>
                      <td>
                        <span className={`status-badge ${node.isLocal ? 'primary' : 'secondary'}`}>
                          {node.isLocal ? 'LOCAL' : 'PEER'}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge online">
                          {node.data_center || 'dc1'}
                        </span>
                      </td>
                      <td className="text-muted">{node.rack || 'rack1'}</td>
                      <td className="text-muted font-mono text-xs">{node.host_id || 'N/A'}</td>
                      <td>
                        <span className="status-badge online">ONLINE</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data">No Cassandra cluster data available</div>
          )}
        </div>
      </section>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="container">
      <header className="header">
        <h1>System Dashboard</h1>
        <p>Real-time monitoring of distributed database clusters</p>
      </header>

      {error && (
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          <button className="btn btn-secondary" onClick={loadDashboard}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* Status bubbles */}
      <section className="status-bubbles">
        <div className={`status-bubble ${controllerHealth?.status === 'ok' ? 'online' : 'offline'}`}>
          <Server className="w-8 h-8" />
          <div className="status-text">
            <div className="status-title">Controller</div>
            <div className="status-value">{controllerHealth?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}</div>
          </div>
        </div>
        <div className={`status-bubble ${mongoStatus ? 'online' : 'offline'}`}>
          <Database className="w-8 h-8" />
          <div className="status-text">
            <div className="status-title">MongoDB</div>
            <div className="status-value">{mongoStatus ? 'ONLINE' : 'OFFLINE'}</div>
            <div className="status-count">{mongoStatus?.members?.length ?? 0} members</div>
          </div>
        </div>
        <div className={`status-bubble ${cassandraStatus ? 'online' : 'offline'}`}>
          <HardDrive className="w-8 h-8" />
          <div className="status-text">
            <div className="status-title">Cassandra</div>
            <div className="status-value">{cassandraStatus ? 'ONLINE' : 'OFFLINE'}</div>
            <div className="status-count">
              {(cassandraStatus?.peers?.length ?? 0) + (cassandraStatus?.local ? 1 : 0)} nodes
            </div>
          </div>
        </div>
      </section>

      {/* Metric cards */}
      <section className="grid grid-cols-2 gap-6" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <h2><Activity className="w-6 h-6" /> Live Metrics</h2>
          <div className="grid grid-cols-2 gap-4" style={{ marginTop: '1rem' }}>
            <div className="metric-card">
              <div className="metric-value">{liveData.cpu.toFixed(1)}%</div>
              <div className="metric-label">CPU Usage</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{liveData.memory.toFixed(1)}%</div>
              <div className="metric-label">Memory Usage</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: '#00d4ff' }}>
                {fmtLatency(liveData.mongo.avg_latency)}
              </div>
              <div className="metric-label">MongoDB Avg Latency</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: '#00ff88' }}>
                {fmtLatency(liveData.cassandra.avg_latency)}
              </div>
              <div className="metric-label">Cassandra Avg Latency</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2><Timer className="w-6 h-6" /> Cluster Uptime</h2>
          <div className="grid grid-cols-2 gap-4" style={{ marginTop: '1rem' }}>
            <div className="metric-card">
              <div className="metric-value">{formatUptime(totalUptimeSeconds)}</div>
              <div className="metric-label">Total Container Uptime</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: '#00d4ff' }}>
                {fmtThroughput(liveData.mongo.throughput)}
              </div>
              <div className="metric-label">MongoDB ops/s</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: '#00ff88' }}>
                {fmtThroughput(liveData.cassandra.throughput)}
              </div>
              <div className="metric-label">Cassandra ops/s</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{Object.keys(containerUptimes).length || '—'}</div>
              <div className="metric-label">Containers Tracked</div>
            </div>
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="charts-section">
        <div className="chart-card">
          <h2><TrendingUp className="w-6 h-6" /> System Performance Metrics</h2>
          <p className="chart-description">
            Live CPU, memory and request activity collected every 5 seconds.
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={liveChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#a0a0a0" />
                <YAxis stroke="#a0a0a0" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ color: '#a0a0a0', fontSize: 12 }} />
                <Line type="monotone" dataKey="cpu"      stroke="#00d4ff" strokeWidth={3} name="CPU %"       />
                <Line type="monotone" dataKey="memory"   stroke="#00ff88" strokeWidth={3} name="Memory %"    />
                <Line type="monotone" dataKey="requests" stroke="#ffaa00" strokeWidth={3} name="Requests/s"  />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2><Clock className="w-6 h-6" /> Response Time Comparison</h2>
          <p className="chart-description">Average latency per operation (ms).</p>
          <div className="chart-container">
            {!chartsHaveData ? (
              <div className="no-data" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                No data yet — run a performance test to populate
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={responseTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="database" stroke="#a0a0a0" fontSize={12} />
                  <YAxis stroke="#a0a0a0" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)} ms`, 'Avg Latency']}
                  />
                  <Bar dataKey="responseTime" fill="#00d4ff" name="Avg Latency (ms)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h2><Activity className="w-6 h-6" /> Throughput Comparison</h2>
          <p className="chart-description">Operations per second processed by each database.</p>
          <div className="chart-container">
            {!chartsHaveData ? (
              <div className="no-data" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                No data yet — run a performance test to populate
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={throughputData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="database" stroke="#a0a0a0" fontSize={12} />
                  <YAxis stroke="#a0a0a0" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(v: any) => [`${Number(v).toFixed(1)} ops/s`, 'Throughput']}
                  />
                  <Bar dataKey="throughput" fill="#00ff88" name="Throughput (ops/s)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h2><Shield className="w-6 h-6" /> MongoDB Health Overview</h2>
          <p className="chart-description">Healthy vs unhealthy replica set members.</p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mongoHealthData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={120}
                  paddingAngle={5} dataKey="value"
                >
                  {mongoHealthData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ color: '#a0a0a0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {renderMongoTable()}
      {renderCassandraTable()}
    </div>
  );
};