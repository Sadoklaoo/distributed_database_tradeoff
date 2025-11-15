import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Server, Database, Activity, HardDrive,
  TrendingUp, Clock, Shield
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

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
  const [mongoStatus, setMongoStatus] = useState<any>(null);
  const [cassandraStatus, setCassandraStatus] = useState<CassandraStatus | null>(null);
  const [containerUptimes, setContainerUptimes] = useState<Record<string, { hours: number; seconds: number; status: string }>>({});
  const [liveData, setLiveData] = useState<{
    timestamp: string;
    cpu: number;
    memory: number;
    mongo: { throughput: number; avg_latency: number };
    cassandra: { throughput: number; avg_latency: number };
  }>({ timestamp: '', cpu: 0, memory: 0, mongo: { throughput: 0, avg_latency: 0 }, cassandra: { throughput: 0, avg_latency: 0 } });
  const [liveChartData, setLiveChartData] = useState<Array<{ time: string; cpu: number; memory: number; requests: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastValues = useRef({
    mongo_throughput: 0,
    cassandra_throughput: 0,
    mongo_latency: 0,
    cassandra_latency: 0
  });

  useEffect(() => {
    let mounted = true;

    const initFetch = async () => {
      try {
        setLoading(true);
        const data = await fetchJson<any>('/api/dashboard/summary');
        if (!mounted) return;

        setControllerHealth(data.controller);
        setMongoStatus(data.mongo);
        setCassandraStatus(data.cassandra);
        setContainerUptimes(data.uptimes || {});
        setLiveData({
          timestamp: data.liveMetrics.timestamp,
          cpu: data.liveMetrics.cpu_percent,
          memory: data.liveMetrics.memory_percent,
          mongo: { throughput: data.liveMetrics.mongo.throughput, avg_latency: data.liveMetrics.mongo.avg_latency },
          cassandra: { throughput: data.liveMetrics.cassandra.throughput, avg_latency: data.liveMetrics.cassandra.avg_latency }
        });
        setLiveChartData([{
          time: new Date(data.liveMetrics.timestamp).toLocaleTimeString(),
          cpu: data.liveMetrics.cpu_percent,
          memory: data.liveMetrics.memory_percent,
          requests: data.liveMetrics.mongo.throughput
        }]);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initFetch();

    liveInterval.current = setInterval(async () => {
      try {
        const live = await fetchJson<any>('/api/report/metrics/live');
        if (!mounted) return;
        const safeMongoThroughput =
          live.mongo?.throughput || lastValues.current.mongo_throughput;

        const safeCassThroughput =
          live.cassandra?.throughput || lastValues.current.cassandra_throughput;

        const safeMongoLatency =
          live.mongo?.avg_latency || lastValues.current.mongo_latency;

        const safeCassLatency =
          live.cassandra?.avg_latency || lastValues.current.cassandra_latency;

        // Update liveData
        setLiveData({
          timestamp: live.timestamp,
          cpu: live.cpu_percent,
          memory: live.memory.percent,
          mongo: { throughput: safeMongoThroughput, avg_latency: safeMongoLatency },
          cassandra: { throughput: safeCassThroughput, avg_latency: safeCassLatency }
        });

        // store last values
        lastValues.current = {
          mongo_throughput: safeMongoThroughput,
          cassandra_throughput: safeCassThroughput,
          mongo_latency: safeMongoLatency,
          cassandra_latency: safeCassLatency
        };
        setLiveChartData(prev => {
          const point = {
            time: new Date(live.timestamp).toLocaleTimeString(),
            cpu: live.cpu_percent,
            memory: live.memory.percent,
            requests: safeMongoThroughput  
          };
          return [...prev.slice(-19), point]; // keep last 20 points
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

  const responseTimeData = useMemo(() => [
    { database: 'MongoDB', responseTime: liveData.mongo.avg_latency },
    { database: 'Cassandra', responseTime: liveData.cassandra.avg_latency }
  ], [liveData]);

  const throughputData = useMemo(() => [
    { database: 'MongoDB', throughput: liveData.mongo.throughput },
    { database: 'Cassandra', throughput: liveData.cassandra.throughput }
  ], [liveData]);

  const mongoHealthData = useMemo(() => [
    { name: 'Healthy', value: mongoStatus?.members?.filter((m: any) => m.health === 1).length ?? 0, color: '#00ff88' },
    { name: 'Unhealthy', value: mongoStatus?.members?.filter((m: any) => m.health !== 1).length ?? 0, color: '#ff4444' }
  ], [mongoStatus]);

  const totalUptimeSeconds = useMemo(() => {
    return Object.values(containerUptimes).reduce((sum, v) => sum + (v.hours * 3600 + v.seconds), 0);
  }, [containerUptimes]);

  if (loading) return <div className="container"><div className="loading"><div className="spinner"></div>Loading dashboard...</div></div>;

  // --- MongoDB Replica Set Table ---
  const renderMongoTable = () => (
    <section className="table-section">
      <div className="table-card">
        <h2>
          <Database className="w-6 h-6" />
          MongoDB Replica Set Members
        </h2>
        {mongoStatus?.members && mongoStatus.members.length > 0 ? (
          <div className="table-container-full">
            <table className="table-full">
              <thead>
                <tr>
                  <th>Node Name</th>
                  <th>State</th>
                  <th>Health Status</th>
                  <th>Uptime</th>
                  <th>Last Heartbeat</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {mongoStatus.members.map((member: any, index: number) => (
                  <tr key={index}>
                    <td className="font-medium">{member.name?.split(':')[0] || `Node ${index + 1}`}</td>
                    <td>
                      <span className={`status-badge ${member.state === 1 ? 'primary' : member.state === 2 ? 'secondary' : 'other'}`}>
                        {member.state === 1 ? 'PRIMARY' : member.state === 2 ? 'SECONDARY' : 'OTHER'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${member.health === 1 ? 'healthy' : 'unhealthy'}`}>
                        {member.health === 1 ? 'HEALTHY' : 'UNHEALTHY'}
                      </span>
                    </td>
                    <td className="text-muted">
                      {member.uptime ? `${Math.floor(member.uptime / 3600)}h ${Math.floor((member.uptime % 3600) / 60)}m` : 'N/A'}
                    </td>
                    <td className="text-muted">
                      {member.lastHeartbeatMessage ?
                        new Date(member.lastHeartbeatMessage).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit'
                        }) :
                        member.lastHeartbeat ?
                          new Date(member.lastHeartbeat).toLocaleString('en-US', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          }) :
                          'Active'
                      }
                    </td>
                    <td className="text-muted">
                      {member.priority ? `Priority: ${member.priority}` :
                        member.electionDate ?
                          `Elected: ${new Date(member.electionDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}` :
                          'Default (1)'
                      }
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

  // --- Cassandra Cluster Peers Table ---
  const renderCassandraTable = () => (
    <section className="table-section">
      <div className="table-card">
        <h2>
          <HardDrive className="w-6 h-6" />
          Cassandra Cluster Peers
        </h2>
        {cassandraStatus?.peers && cassandraStatus.peers.length > 0 ? (
          <div className="table-container-full">
            <table className="table-full">
              <thead>
                <tr>
                  <th>Peer Address</th>
                  <th>Data Center</th>
                  <th>Rack</th>
                  <th>Host ID</th>
                  <th>RPC Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cassandraStatus.peers.map((peer: any, index: number) => (
                  <tr key={index}>
                    <td className="font-medium">{peer.peer || 'N/A'}</td>
                    <td>
                      <span className="status-badge online">
                        {peer.data_center || 'N/A'}
                      </span>
                    </td>
                    <td className="text-muted">{peer.rack || 'rack1'}</td>
                    <td className="text-muted font-mono text-xs">{peer.host_id || 'N/A'}</td>
                    <td className="text-muted">{peer.rpc_address || 'N/A'}</td>
                    <td>
                      <span className="status-badge online">ONLINE</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-data">No Cassandra cluster peers data available</div>
        )}
      </div>
    </section>
  );


  return (
    <div className="container">
      <header className="header">
        <h1>System Dashboard</h1>
        <p>Real‑time monitoring of distributed database clusters</p>
      </header>

      {error && <div className="error">{error}</div>}

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
            <div className="status-count">{cassandraStatus?.peers?.length ?? 0} peers</div>
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
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                />
                <Line type="monotone" dataKey="cpu" stroke="#00d4ff" strokeWidth={3} isAnimationActive={false} />
                <Line type="monotone" dataKey="memory" stroke="#00ff88" strokeWidth={3} isAnimationActive={false} />
                <Line type="monotone" dataKey="requests" stroke="#ffaa00" strokeWidth={3} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2><Clock className="w-6 h-6" /> Response Time Comparison</h2>
          <p className="chart-description">
            Average latency per operation for MongoDB vs Cassandra.
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="database" stroke="#a0a0a0" fontSize={12} />
                <YAxis stroke="#a0a0a0" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#00eaff" }}
                />
                <Bar dataKey="responseTime" fill="#00d4ff" name="Response Time (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2><Activity className="w-6 h-6" /> Throughput Comparison</h2>
          <p className="chart-description">
            Number of operations per second processed by each database.
          </p>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="database" stroke="#a0a0a0" fontSize={12} />
                <YAxis stroke="#a0a0a0" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#00eaff" }}
                />
                <Bar dataKey="throughput" fill="#00ff88" name="Throughput (ops/sec)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="chart-card">
          <h2><Shield className="w-6 h-6" /> MongoDB Health Overview</h2>
          <p className="chart-description">
            Shows how many replica set members are healthy vs unhealthy.
          </p>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[...mongoHealthData, { name: 'Other', value: 0, color: '#888' }]}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={120}
                  fill="#888" paddingAngle={5} dataKey="value">
                  {mongoHealthData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#00eaff" }}
                />
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
