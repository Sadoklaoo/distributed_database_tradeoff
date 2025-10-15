import React, { useState } from 'react';
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
  ResponsiveContainer
} from 'recharts';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const FailureTesting: React.FC = () => {
  const [failureConfig, setFailureConfig] = useState({
    failureType: 'node',
    targetNode: 'mongo1',
    duration: 30,
    testOperations: true
  });
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResults, setSimulationResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runFailureSimulation = async () => {
    try {
      setIsSimulating(true);
      setError(null);
      
      const result = await fetchJson('/api/failure/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(failureConfig)
      });
      
      setSimulationResults(result);
    } catch (e: any) {
      setError(e.message);
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

  const recoveryData = simulationResults?.recoveryMetrics || [];
  const availabilityData = simulationResults?.availabilityMetrics || [];

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

      {/* Failure Configuration */}
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
              onChange={(e) => setFailureConfig({...failureConfig, duration: parseInt(e.target.value)})}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Test Operations During Failure</label>
            <input 
              type="checkbox" 
              checked={failureConfig.testOperations}
              onChange={(e) => setFailureConfig({...failureConfig, testOperations: e.target.checked})}
              className="form-checkbox"
            />
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
          {/* Recovery Analysis */}
          <section className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2>
                <Clock className="w-6 h-6" />
                Recovery Time Analysis
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={recoveryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="mongodb" 
                      stackId="1" 
                      stroke="#00d4ff" 
                      fill="rgba(0, 212, 255, 0.3)" 
                      name="MongoDB Recovery"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cassandra" 
                      stackId="2" 
                      stroke="#00ff88" 
                      fill="rgba(0, 255, 136, 0.3)" 
                      name="Cassandra Recovery"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2>
                <CheckCircle className="w-6 h-6" />
                Service Availability
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={availabilityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
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
                      dataKey="mongodb" 
                      stroke="#00d4ff" 
                      strokeWidth={3}
                      dot={{ fill: '#00d4ff', strokeWidth: 2, r: 5 }}
                      name="MongoDB Availability %"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cassandra" 
                      stroke="#00ff88" 
                      strokeWidth={3}
                      dot={{ fill: '#00ff88', strokeWidth: 2, r: 5 }}
                      name="Cassandra Availability %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                <div className="metric-value">{simulationResults.summary?.mongodbDowntime || 0}s</div>
                <div className="metric-label">MongoDB Downtime</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary?.cassandraDowntime || 0}s</div>
                <div className="metric-label">Cassandra Downtime</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary?.dataLossMongo || 0}</div>
                <div className="metric-label">MongoDB Data Loss</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{simulationResults.summary?.dataLossCassandra || 0}</div>
                <div className="metric-label">Cassandra Data Loss</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
