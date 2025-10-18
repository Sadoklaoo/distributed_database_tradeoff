import React, { useState } from 'react';
import { 
  Play, 
  BarChart3, 
  Clock, 
  Zap,
  TrendingUp,
  Activity
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer} from 'recharts';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const Performance: React.FC = () => {
  const [testConfig, setTestConfig] = useState({
    operationCount: 1000,
    batchSize: 100,
    consistencyLevel: 'eventual',
    testType: 'mixed'
  });
  
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPerformanceTest = async () => {
    try {
      setIsRunning(true);
      setError(null);
      
      const result = await fetchJson('/api/performance/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testConfig)
      });
      
      setTestResults(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const latencyData = testResults?.latencyMetrics || [];
  const throughputData = testResults?.throughputMetrics || [];

  return (
    <div className="container">
      <header className="header">
        <h1>
          <BarChart3 className="w-8 h-8" />
          Performance Testing
        </h1>
        <p>Systematic evaluation of Cassandra vs MongoDB performance characteristics</p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* Test Configuration */}
      <section className="card">
        <h2>
          <Activity className="w-6 h-6" />
          Test Configuration
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="form-group">
            <label>Operation Count</label>
            <input 
              type="number" 
              value={testConfig.operationCount}
              onChange={(e) => setTestConfig({...testConfig, operationCount: parseInt(e.target.value)})}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Batch Size</label>
            <input 
              type="number" 
              value={testConfig.batchSize}
              onChange={(e) => setTestConfig({...testConfig, batchSize: parseInt(e.target.value)})}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Consistency Level</label>
            <select 
              value={testConfig.consistencyLevel}
              onChange={(e) => setTestConfig({...testConfig, consistencyLevel: e.target.value})}
              className="form-input"
            >
              <option value="eventual">Eventual</option>
              <option value="strong">Strong</option>
              <option value="session">Session</option>
            </select>
          </div>
          <div className="form-group">
            <label>Test Type</label>
            <select 
              value={testConfig.testType}
              onChange={(e) => setTestConfig({...testConfig, testType: e.target.value})}
              className="form-input"
            >
              <option value="mixed">Mixed Operations</option>
              <option value="read-heavy">Read Heavy</option>
              <option value="write-heavy">Write Heavy</option>
              <option value="update-heavy">Update Heavy</option>
            </select>
          </div>
        </div>
        <button 
          onClick={runPerformanceTest}
          disabled={isRunning}
          className="btn btn-primary"
        >
          {isRunning ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              Running Tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Performance Test
            </>
          )}
        </button>
      </section>

      {testResults && (
        <>
          {/* Performance Metrics */}
          <section className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2>
                <Clock className="w-6 h-6" />
                Latency Comparison
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={latencyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="operation" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Bar dataKey="mongodb" fill="#00d4ff" name="MongoDB" />
                    <Bar dataKey="cassandra" fill="#00ff88" name="Cassandra" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2>
                <Zap className="w-6 h-6" />
                Throughput Comparison
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={throughputData}>
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
                      name="MongoDB Ops/sec"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cassandra" 
                      stroke="#00ff88" 
                      strokeWidth={3}
                      dot={{ fill: '#00ff88', strokeWidth: 2, r: 5 }}
                      name="Cassandra Ops/sec"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Detailed Results */}
          <section className="card">
            <h2>
              <TrendingUp className="w-6 h-6" />
              Test Results Summary
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="metric-card">
                <div className="metric-value">{testResults.summary?.totalOperations || 0}</div>
                <div className="metric-label">Total Operations</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{testResults.summary?.avgLatencyMongo || 0}ms</div>
                <div className="metric-label">MongoDB Avg Latency</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{testResults.summary?.avgLatencyCassandra || 0}ms</div>
                <div className="metric-label">Cassandra Avg Latency</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{testResults.summary?.throughputDiff || 0}%</div>
                <div className="metric-label">Throughput Difference</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
