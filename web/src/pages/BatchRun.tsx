import React, { useMemo, useState } from 'react';
import { Play, BarChart3, Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface BatchRunConfig {
  operationCount: number;
  batchSize: number;
  consistencyLevel: string;
  testType: string;
  repeats: number;
}

interface LatencyStats {
  mean_ms: number;
  std_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  n_samples: number;
}

interface BatchRunResult {
  mongodb_insert: LatencyStats;
  mongodb_read: LatencyStats;
  mongodb_update: LatencyStats;
  mongodb_throughput_mean: number;
  mongodb_throughput_std: number;
  cassandra_insert: LatencyStats;
  cassandra_read: LatencyStats;
  cassandra_update: LatencyStats;
  cassandra_throughput_mean: number;
  cassandra_throughput_std: number;
  repeats: number;
  test_type: string;
  completed_at: string;
}

const renderSparkline = (values: Array<number | undefined>) => {
  const maxValue = Math.max(...values.map((v) => v ?? 0), 1);

  return (
    <div className="sparkline">
      <div className="sparkline-label">min → mean → p95 → p99</div>
      <div className="sparkline-bars">
        {values.map((value, index) => {
          const height = value && !Number.isNaN(value) ? Math.max((value / maxValue) * 100, 8) : 8;
          return (
            <span
              key={index}
              className="sparkline-bar"
              title={`${value !== undefined ? value.toFixed(2) : 'N/A'}`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const BatchRun: React.FC = () => {
  const [config, setConfig] = useState<BatchRunConfig>({
    operationCount: 1000,
    batchSize: 100,
    consistencyLevel: 'eventual',
    testType: 'mixed',
    repeats: 5,
  });

  const [result, setResult] = useState<BatchRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latencyChartData = useMemo(() => {
    if (!result) return [];
    return [
      {
        operation: 'Insert',
        MongoDB: result.mongodb_insert.mean_ms,
        Cassandra: result.cassandra_insert.mean_ms,
      },
      {
        operation: 'Read',
        MongoDB: result.mongodb_read.mean_ms,
        Cassandra: result.cassandra_read.mean_ms,
      },
      {
        operation: 'Update',
        MongoDB: result.mongodb_update.mean_ms,
        Cassandra: result.cassandra_update.mean_ms,
      },
    ];
  }, [result]);

  const throughputChartData = useMemo(() => {
    if (!result) return [];
    return [
      {
        db: 'MongoDB',
        throughput: result.mongodb_throughput_mean,
        std: result.mongodb_throughput_std,
      },
      {
        db: 'Cassandra',
        throughput: result.cassandra_throughput_mean,
        std: result.cassandra_throughput_std,
      },
    ];
  }, [result]);

  const runBatch = async () => {
    try {
      setIsRunning(true);
      setError(null);
      const res = await fetchJson<BatchRunResult>('/api/performance/batch-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setResult(res);
      toast.success('Batch run completed successfully!');
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error('❌ Error running batch run.');
    } finally {
      setIsRunning(false);
    }
  };

  const renderStatsCards = (title: string, stats: Record<string, LatencyStats>) => (
    <div className="card">
      <h2>
        <BarChart3 className="w-6 h-6" />
        {title}
      </h2>
      <div className="card-legend">min / mean / p95 / p99</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {['insert', 'read', 'update'].map((op) => {
          const stat = stats[op];
          return (
            <div key={op} className="metric-card">
              <div className="metric-label" style={{ marginBottom: '0.5rem' }}>
                {op.toUpperCase()}
              </div>
              <div className="metric-row">
                <span className="metric-title">Mean</span>
                <span className="metric-value-small">
                  {stat?.mean_ms?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-title">Std</span>
                <span className="metric-value-small">
                  {stat?.std_ms?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-title">P95</span>
                <span className="metric-value-small">
                  {stat?.p95_ms?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-title">P99</span>
                <span className="metric-value-small">
                  {stat?.p99_ms?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-title">Samples</span>
                <span className="metric-value-small">
                  {stat?.n_samples ?? 0}
                </span>
              </div>

              <div className="sparkline-container">
                {renderSparkline([
                  stat?.min_ms,
                  stat?.mean_ms,
                  stat?.p95_ms,
                  stat?.p99_ms,
                ])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="container">
      <header className="header">
        <h1>
          <BarChart3 className="w-8 h-8" />
          Batch Performance Runs
        </h1>
        <p>
          Run the performance workload multiple times and aggregate statistics across
          runs (mean, std, percentiles). Useful for understanding variability.
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>
          <Activity className="w-6 h-6" />
          Batch Run Configuration
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <div className="form-group">
            <label>Operation Count</label>
            <p className="form-description">
              Number of operations performed per run (will be repeated {config.repeats} times).
            </p>
            <input
              type="number"
              value={config.operationCount}
              onChange={(e) =>
                setConfig({ ...config, operationCount: parseInt(e.target.value) })
              }
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Batch Size</label>
            <p className="form-description">
              Number of operations sent in one batch during each run.
            </p>
            <input
              type="number"
              value={config.batchSize}
              onChange={(e) =>
                setConfig({ ...config, batchSize: parseInt(e.target.value) })
              }
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Repeats</label>
            <p className="form-description">
              Run the full workload this many times to compute mean + standard deviation.
            </p>
            <input
              type="number"
              value={config.repeats}
              onChange={(e) =>
                setConfig({ ...config, repeats: parseInt(e.target.value) })
              }
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Consistency Level</label>
            <p className="form-description">
              Determines how strictly the database maintains consistency.
            </p>
            <select
              value={config.consistencyLevel}
              onChange={(e) =>
                setConfig({ ...config, consistencyLevel: e.target.value })
              }
              className="form-input"
            >
              <option value="eventual">Eventual</option>
              <option value="strong">Strong</option>
              <option value="session">Session</option>
            </select>
          </div>

          <div className="form-group">
            <label>Test Type</label>
            <p className="form-description">
              Select the type of operations that will dominate the test.
            </p>
            <select
              value={config.testType}
              onChange={(e) => setConfig({ ...config, testType: e.target.value })}
              className="form-input"
            >
              <option value="mixed">Mixed Operations</option>
              <option value="read">Read Heavy</option>
              <option value="write">Write Heavy</option>
              <option value="update">Update Heavy</option>
            </select>
          </div>
        </div>

        <button
          onClick={runBatch}
          disabled={isRunning}
          className="btn btn-primary"
        >
          {isRunning ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              Running batch...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Batch
            </>
          )}
        </button>
      </section>

      {result && (
        <>
          <section className="card">
            <h2>
              <BarChart3 className="w-6 h-6" />
              Summary
            </h2>
            <div className="grid grid-cols-3 gap-6">
              <div className="metric-card">
                <div className="metric-value">{result.repeats}</div>
                <div className="metric-label">Repeats</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{result.test_type}</div>
                <div className="metric-label">Test Type</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">
                  {new Date(result.completed_at).toLocaleString()}
                </div>
                <div className="metric-label">Completed</div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="chart-card">
              <h2>
                <BarChart3 className="w-6 h-6" />
                Latency (Mean) by Operation
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={latencyChartData}
                    margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="operation" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: 8,
                        color: '#fff',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="MongoDB" fill="#00d4ff" />
                    <Bar dataKey="Cassandra" fill="#00ff88" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <h2>
                <BarChart3 className="w-6 h-6" />
                Throughput (Mean)
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={throughputChartData}
                    margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="db" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: 8,
                        color: '#fff',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="throughput" fill="#00d4ff" name="Throughput" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderStatsCards('MongoDB Latency Stats', {
              insert: result.mongodb_insert,
              read: result.mongodb_read,
              update: result.mongodb_update,
            })}
            {renderStatsCards('Cassandra Latency Stats', {
              insert: result.cassandra_insert,
              read: result.cassandra_read,
              update: result.cassandra_update,
            })}
          </section>

          <section className="card">
            <h2>
              <BarChart3 className="w-6 h-6" />
              Throughput (ops/sec)
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="metric-card">
                <div className="metric-value">
                  {result.mongodb_throughput_mean.toFixed(3)}
                </div>
                <div className="metric-label">MongoDB Mean</div>
                <div className="metric-extra">
                  σ {result.mongodb_throughput_std.toFixed(3)}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-value">
                  {result.cassandra_throughput_mean.toFixed(3)}
                </div>
                <div className="metric-label">Cassandra Mean</div>
                <div className="metric-extra">
                  σ {result.cassandra_throughput_std.toFixed(3)}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
