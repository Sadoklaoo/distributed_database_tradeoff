import React, { useEffect, useState } from 'react';
import { 
  Server, 
  Database, 
  Activity, 
  HardDrive,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  Cpu
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
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

  // Mock data for charts
  const systemMetrics = [
    { time: '00:00', cpu: 45, memory: 60, requests: 120 },
    { time: '04:00', cpu: 52, memory: 65, requests: 95 },
    { time: '08:00', cpu: 78, memory: 70, requests: 180 },
    { time: '12:00', cpu: 85, memory: 75, requests: 220 },
    { time: '16:00', cpu: 72, memory: 68, requests: 190 },
    { time: '20:00', cpu: 58, memory: 62, requests: 150 },
  ];

  const mongoHealthData = [
    { name: 'Healthy', value: mongoStatus?.members?.filter((m: any) => m.health === 1).length || 0, color: '#00ff88' },
    { name: 'Unhealthy', value: mongoStatus?.members?.filter((m: any) => m.health !== 1).length || 0, color: '#ff4444' },
  ];

  const replicaSetData = mongoStatus?.members?.map((member: any, index: number) => ({
    name: member.name?.split(':')[0] || `Node ${index + 1}`,
    uptime: member.uptime ? Math.floor(member.uptime / 3600) : 0,
    state: member.state === 1 ? 'Primary' : member.state === 2 ? 'Secondary' : 'Other'
  })) || [];

  return (
    <div className="container">
      <header className="header">
        <h1>System Dashboard</h1>
        <p>Real-time monitoring of distributed database clusters</p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* Status Bubbles */}
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
          </div>
        </div>
        
        <div className={`status-bubble ${cassandraStatus ? 'online' : 'offline'}`}>
          <HardDrive className="w-8 h-8" />
          <div className="status-text">
            <div className="status-title">Cassandra</div>
            <div className="status-value">{cassandraStatus ? 'ONLINE' : 'OFFLINE'}</div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="charts-section">
        <div className="chart-card">
          <h2>
            <TrendingUp className="w-6 h-6" />
            System Performance Metrics
          </h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={systemMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="time" 
                  stroke="#a0a0a0" 
                  fontSize={12}
                  tick={{ fill: '#a0a0a0' }}
                />
                <YAxis 
                  stroke="#a0a0a0" 
                  fontSize={12}
                  tick={{ fill: '#a0a0a0' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333', 
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="#00d4ff" 
                  strokeWidth={3}
                  dot={{ fill: '#00d4ff', strokeWidth: 2, r: 5 }}
                  name="CPU Usage %"
                />
                <Line 
                  type="monotone" 
                  dataKey="memory" 
                  stroke="#00ff88" 
                  strokeWidth={3}
                  dot={{ fill: '#00ff88', strokeWidth: 2, r: 5 }}
                  name="Memory Usage %"
                />
                <Line 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="#ffaa00" 
                  strokeWidth={3}
                  dot={{ fill: '#ffaa00', strokeWidth: 2, r: 5 }}
                  name="Requests/min"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2>
            <Activity className="w-6 h-6" />
            Database Health Distribution
          </h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mongoHealthData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {mongoHealthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333', 
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#00ff88' }}></div>
                <span>Healthy Nodes ({mongoHealthData[0]?.value || 0})</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#ff4444' }}></div>
                <span>Unhealthy Nodes ({mongoHealthData[1]?.value || 0})</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MongoDB Replica Set Table */}
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
                        {member.lastHeartbeatMessage || 'N/A'}
                      </td>
                      <td className="text-muted">
                        {member.priority || 'N/A'}
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

      {/* Cassandra Cluster Peers Table */}
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
                      <td className="text-muted">
                        {peer.rack || 'N/A'}
                      </td>
                      <td className="text-muted font-mono text-xs">
                        {peer.host_id ? peer.host_id.substring(0, 8) + '...' : 'N/A'}
                      </td>
                      <td className="text-muted">
                        {peer.rpc_address || 'N/A'}
                      </td>
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
    </div>
  );
};
