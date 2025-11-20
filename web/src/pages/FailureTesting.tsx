import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Power, 
  Wifi, 
  Database,
  HardDrive,
  Activity,
  CheckCircle,
  XCircle,
  Clock
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
  ScatterChart,
  Scatter
} from 'recharts';

// Add proper TypeScript interfaces
interface DBMetric {
  success: boolean;
  latency: number | null;
  error: string | null;
}

interface AvailabilityMetric {
  time: string;
  mongodb: DBMetric;
  cassandra: DBMetric;
}

interface RecoveryMetric {
  time: string;
  mongodb: number; // 0-100%
  cassandra: number; // 0-100%
}

interface SimulationResults {
  summary: {
    failureType: string;
    targetNode: string;
    duration: number;
    mongodbDowntime: number;
    cassandraDowntime: number;
    dataLossMongo: number;
    dataLossCassandra: number;
    recoveryTime: number;
    mode: string;
  };
  availabilityMetrics: AvailabilityMetric[];
  recoveryMetrics: RecoveryMetric[];
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
  try {
    const res = await fetch(path, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export const FailureTesting: React.FC = () => {
  const [failureConfig, setFailureConfig] = useState({
    failureType: 'node',
    targetNode: 'mongo1',
    duration: 30,
    testOperations: true
  });
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capAnalysis, setCapAnalysis] = useState<any>(null);
  
  // Fetch CAP analysis on mount
  useEffect(() => {
    fetchJson('/api/cap-analysis')
      .then(setCapAnalysis)
      .catch(err => console.error('Failed to fetch CAP analysis:', err));
  }, []);

  const runFailureSimulation = async () => {
    try {
      setIsSimulating(true);
      setError(null);
      setSimulationResults(null); // Clear old results
      
      const result = await fetchJson<SimulationResults>('/api/failure/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(failureConfig)
      });
      
      setSimulationResults(result);
    } catch (e: any) {
      setError(e.message || 'Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const stopFailureSimulation = async () => {
    try {
      await fetchJson('/api/failure/stop', { method: 'POST' });
      setIsSimulating(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // --- FIXED: Separate latency and availability data ---
  const latencyChartData = simulationResults?.availabilityMetrics.map((item) => ({
    time: item.time,
    mongodb: item.mongodb.latency ?? null, // null when down
    cassandra: item.cassandra.latency ?? null, // null when down
  })) || [];

  const availabilityChartData = simulationResults?.availabilityMetrics.map((item) => ({
    time: item.time,
    mongodb: item.mongodb.success ? 100 : 0, // 100% when available
    cassandra: item.cassandra.success ? 100 : 0, // 0% when down
  })) || [];

  return (
    <div className="container">
      <header className="header">
        <h1>
          <AlertTriangle className="w-8 h-8" />
          Failure Testing & Recovery
        </h1>
        <p>Simulate node failures and network partitions to test CAP theorem behavior</p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* Configuration */}
      <section className="card">
        <h2>
          <Activity className="w-6 h-6" />
          Failure Simulation Configuration
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="form-group">
            <label>Failure Type</label>
            <select 
              value={failureConfig.failureType}
              onChange={(e) => setFailureConfig({...failureConfig, failureType: e.target.value})}
              className="form-input"
            >
              <option value="node">Node Failure</option>
              <option value="network">Network Partition</option>
              <option value="disk">Disk Failure</option>
              <option value="memory">Memory Exhaustion</option>
            </select>
          </div>
          <div className="form-group">
            <label>Target Node</label>
            <select 
              value={failureConfig.targetNode}
              onChange={(e) => setFailureConfig({...failureConfig, targetNode: e.target.value})}
              className="form-input"
            >
              <option value="mongo1">MongoDB Node 1</option>
              <option value="mongo2">MongoDB Node 2</option>
              <option value="mongo3">MongoDB Node 3</option>
              <option value="cassandra1">Cassandra Node 1</option>
              <option value="cassandra2">Cassandra Node 2</option>
              <option value="cassandra3">Cassandra Node 3</option>
            </select>
          </div>
          <div className="form-group">
            <label>Duration (seconds)</label>
            <input 
              type="number" 
              value={failureConfig.duration}
              onChange={(e) => setFailureConfig({...failureConfig, duration: parseInt(e.target.value) || 30})}
              className="form-input"
              min="1"
              max="300"
            />
          </div>
          <div className="form-group">
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={failureConfig.testOperations}
                onChange={(e) => setFailureConfig({...failureConfig, testOperations: e.target.checked})}
                className="form-checkbox"
              />
              Test Operations During Failure
            </label>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={runFailureSimulation}
            disabled={isSimulating}
            className="btn btn-danger"
          >
            {isSimulating ? (
              <>
                <Activity className="w-4 h-4 animate-spin" />
                Simulating Failure...
              </>
            ) : (
              <>
                <Power className="w-4 h-4" />
                Start Failure Simulation
              </>
            )}
          </button>
          
          {isSimulating && (
            <button 
              onClick={stopFailureSimulation}
              className="btn btn-secondary"
            >
              <XCircle className="w-4 h-4" />
              Stop Simulation
            </button>
          )}
        </div>
      </section>

      {/* CAP Theorem Analysis */}
      <section className="grid grid-cols-2 gap-6">
        <div className="card">
          <h2>
            <Database className="w-6 h-6" />
            MongoDB (CP System)
          </h2>
          <div className="cap-analysis">
            <div className="cap-item">
              <div className="cap-label">Consistency</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '90%', backgroundColor: '#00d4ff' }}></div>
              </div>
              <div className="cap-value">High</div>
            </div>
            <div className="cap-item">
              <div className="cap-label">Availability</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '70%', backgroundColor: '#ffaa00' }}></div>
              </div>
              <div className="cap-value">Medium</div>
            </div>
            <div className="cap-item">
              <div className="cap-label">Partition Tolerance</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '85%', backgroundColor: '#00ff88' }}></div>
              </div>
              <div className="cap-value">High</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>
            <HardDrive className="w-6 h-6" />
            Cassandra (AP System)
          </h2>
          <div className="cap-analysis">
            <div className="cap-item">
              <div className="cap-label">Consistency</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '60%', backgroundColor: '#ffaa00' }}></div>
              </div>
              <div className="cap-value">Medium</div>
            </div>
            <div className="cap-item">
              <div className="cap-label">Availability</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '95%', backgroundColor: '#00ff88' }}></div>
              </div>
              <div className="cap-value">Very High</div>
            </div>
            <div className="cap-item">
              <div className="cap-label">Partition Tolerance</div>
              <div className="cap-bar">
                <div className="cap-fill" style={{ width: '95%', backgroundColor: '#00ff88' }}></div>
              </div>
              <div className="cap-value">Very High</div>
            </div>
          </div>
        </div>
      </section>

      {simulationResults && (
        <>
          {/* Latency Chart */}
          <section className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2>
                <Clock className="w-6 h-6" />
                Operation Latency (ms)
              </h2>
              <div className="chart-container" style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#a0a0a0" fontSize={12} />
                    <YAxis 
                      stroke="#a0a0a0" 
                      fontSize={12}
                      domain={[0, 'auto']} // Auto-scale based on max latency
                      label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fill: '#a0a0a0' }}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload) return null;
                        return (
                          <div className="chart-tooltip">
                            <strong>Time: {label}</strong>
                            {payload.map((p: any) => (
                              <div key={p.dataKey}>
                                {p.dataKey}: {p.value !== null ? `${p.value}ms` : 'DOWN'}
                              </div>
                            ))}
                          </div>
                        );
                      }}
                      contentStyle={{ 
                        backgroundColor: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="mongodb" 
                      stroke="#00d4ff" 
                      strokeWidth={3}
                      dot={{ fill: '#00d4ff', strokeWidth: 2, r: 5 }}
                      name="MongoDB Latency"
                      connectNulls={false} // Don't connect null values
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cassandra" 
                      stroke="#00ff88" 
                      strokeWidth={3}
                      dot={{ fill: '#00ff88', strokeWidth: 2, r: 5 }}
                      name="Cassandra Latency"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Shows actual latency. Null = database unreachable.
              </p>
            </div>

            {/* Availability Chart */}
            <div className="card">
              <h2>
                <CheckCircle className="w-6 h-6" />
                Service Availability (%)
              </h2>
              <div className="chart-container" style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={availabilityChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#a0a0a0" fontSize={12} />
                    <YAxis 
                      stroke="#a0a0a0" 
                      fontSize={12}
                      domain={[0, 100]}
                      label={{ value: 'Availability %', angle: -90, position: 'insideLeft', fill: '#a0a0a0' }}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload) return null;
                        return (
                          <div className="chart-tooltip">
                            <strong>Time: {label}</strong>
                            {payload.map((p: any) => (
                              <div key={p.dataKey}>
                                {p.dataKey}: {p.value}%
                              </div>
                            ))}
                          </div>
                        );
                      }}
                      contentStyle={{ 
                        backgroundColor: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Area 
                      type="step" 
                      dataKey="mongodb" 
                      stackId="1" 
                      stroke="#00d4ff" 
                      fill="rgba(0, 212, 255, 0.3)" 
                      name="MongoDB Availability"
                    />
                    <Area 
                      type="step" 
                      dataKey="cassandra" 
                      stackId="2" 
                      stroke="#00ff88" 
                      fill="rgba(0, 255, 136, 0.3)" 
                      name="Cassandra Availability"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                100% = fully available, 0% = completely down.
              </p>
            </div>
          </section>

          {/* Failure Impact Summary */}
          <section className="card">
            <h2>
              <AlertTriangle className="w-6 h-6" />
              Failure Impact Summary
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary.mongodbDowntime}s</div>
                <div className="metric-label">MongoDB Downtime</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary.cassandraDowntime}s</div>
                <div className="metric-label">Cassandra Downtime</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary.recoveryTime}s</div>
                <div className="metric-label">Recovery Time</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary.mode}</div>
                <div className="metric-label">Simulation Mode</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

// Add CSS for the new tooltip
const style = document.createElement('style');
style.textContent = `
  .chart-tooltip {
    padding: 8px 12px;
    border-radius: 4px;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #fff;
    font-size: 12px;
  }
  .chart-tooltip strong {
    display: block;
    margin-bottom: 4px;
    color: #00d4ff;
  }
  .chart-container {
    background: #0a0a0a;
    border-radius: 8px;
    padding: 16px;
    border: 1px solid #222;
  }
`;
document.head.appendChild(style);