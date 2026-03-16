import React, { useState } from 'react';
import {
  Play,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Activity,
  BarChart3,
} from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StalenessStats {
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
  stale_reads: number;
  total_reads: number;
  stale_ratio: number;
}

interface StalenessResult {
  cassandra: StalenessStats;
  mongodb: StalenessStats;
  config: {
    iterations: number;
    write_delay_ms: number;
    consistency: string;
    mongo_write_concern: number;
    mongo_read_secondary: boolean;
  };
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function fmt(n: number) {
  return n.toFixed(3);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Staleness: React.FC = () => {
  const [config, setConfig] = useState({
    iterations: 200,
    write_delay_ms: 50,
    consistency: 'ONE',
    mongo_write_concern: 1,
    mongo_read_secondary: true,
  });

  const [results, setResults] = useState<StalenessResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    try {
      setIsRunning(true);
      setError(null);
      const result = await fetchJson<StalenessResult>('/api/staleness/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setResults(result);
      toast.success('Staleness measurement completed!');
    } catch (e: any) {
      setError(e.message);
      toast.error('❌ Error running staleness measurement.');
    } finally {
      setIsRunning(false);
    }
  };

  // ── chart data ────────────────────────────────────────────────────────────

  const latencyChartData = results
    ? [
        {
          metric: 'Mean',
          MongoDB: parseFloat(fmt(results.mongodb.mean_ms)),
          Cassandra: parseFloat(fmt(results.cassandra.mean_ms)),
        },
        {
          metric: 'Median',
          MongoDB: parseFloat(fmt(results.mongodb.median_ms)),
          Cassandra: parseFloat(fmt(results.cassandra.median_ms)),
        },
        {
          metric: 'P95',
          MongoDB: parseFloat(fmt(results.mongodb.p95_ms)),
          Cassandra: parseFloat(fmt(results.cassandra.p95_ms)),
        },
        {
          metric: 'P99',
          MongoDB: parseFloat(fmt(results.mongodb.p99_ms)),
          Cassandra: parseFloat(fmt(results.cassandra.p99_ms)),
        },
        {
          metric: 'Max',
          MongoDB: parseFloat(fmt(results.mongodb.max_ms)),
          Cassandra: parseFloat(fmt(results.cassandra.max_ms)),
        },
      ]
    : [];

  const staleRatioData = results
    ? [
        {
          db: 'MongoDB',
          'Stale Ratio (%)': parseFloat((results.mongodb.stale_ratio * 100).toFixed(1)),
        },
        {
          db: 'Cassandra',
          'Stale Ratio (%)': parseFloat((results.cassandra.stale_ratio * 100).toFixed(1)),
        },
      ]
    : [];

  // ── staleness interpretation badge ────────────────────────────────────────

  const badge = (ratio: number) => {
    if (ratio >= 0.9)
      return (
        <span style={{ color: '#ff6b6b', fontWeight: 600 }}>
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          High staleness
        </span>
      );
    if (ratio >= 0.3)
      return (
        <span style={{ color: '#ffd93d', fontWeight: 600 }}>
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          Moderate staleness
        </span>
      );
    return (
      <span style={{ color: '#00ff88', fontWeight: 600 }}>
        <ShieldCheck className="w-4 h-4 inline mr-1" />
        Low staleness
      </span>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container">
      <header className="header">
        <h1>
          <Clock className="w-8 h-8" />
          Staleness Measurement
        </h1>
        <p>
          Quantify replication lag and stale-read ratio for Cassandra and
          MongoDB under configurable consistency levels (RQ2).
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      {/* ── Configuration ─────────────────────────────────────────────── */}
      <section className="card">
        <h2>
          <Activity className="w-6 h-6" />
          Measurement Configuration
        </h2>

        <div className="grid grid-cols-2 gap-6">
          {/* iterations */}
          <div className="form-group">
            <label>Iterations</label>
            <p className="form-description">
              Number of write→read cycles per system.
            </p>
            <input
              type="number"
              value={config.iterations}
              onChange={(e) =>
                setConfig({ ...config, iterations: parseInt(e.target.value) })
              }
              className="form-input"
            />
          </div>

          {/* write delay */}
          <div className="form-group">
            <label>Write Delay (ms)</label>
            <p className="form-description">
              Pause between cycles; increase to reduce measurement noise.
            </p>
            <input
              type="number"
              value={config.write_delay_ms}
              onChange={(e) =>
                setConfig({
                  ...config,
                  write_delay_ms: parseFloat(e.target.value),
                })
              }
              className="form-input"
            />
          </div>

          {/* cassandra consistency */}
          <div className="form-group">
            <label>Cassandra Consistency Level</label>
            <p className="form-description">
              ONE = fastest, stale reads possible. QUORUM = majority
              acknowledgement. ALL = strongest, slowest.
            </p>
            <select
              value={config.consistency}
              onChange={(e) =>
                setConfig({ ...config, consistency: e.target.value })
              }
              className="form-input"
            >
              <option value="ONE">ONE</option>
              <option value="QUORUM">QUORUM</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          {/* mongodb read target */}
          <div className="form-group">
            <label>MongoDB Read Target</label>
            <p className="form-description">
              Secondary exposes replication lag. Primary always returns fresh
              data.
            </p>
            <select
              value={config.mongo_read_secondary ? 'secondary' : 'primary'}
              onChange={(e) =>
                setConfig({
                  ...config,
                  mongo_read_secondary: e.target.value === 'secondary',
                })
              }
              className="form-input"
            >
              <option value="secondary">Secondary (exposes lag)</option>
              <option value="primary">Primary (baseline)</option>
            </select>
          </div>
        </div>

        <button
          onClick={runTest}
          disabled={isRunning}
          className="btn btn-primary"
        >
          {isRunning ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              Measuring staleness...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Staleness Measurement
            </>
          )}
        </button>
      </section>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {results && (
        <>
          {/* summary metric cards */}
          <section className="grid grid-cols-2 gap-6">
            {/* Cassandra card */}
            <div className="card">
              <h2 style={{ color: '#00ff88' }}>
                <ShieldCheck className="w-6 h-6" />
                Cassandra — {results.config.consistency}
              </h2>
              <div className="grid grid-cols-2 gap-4" style={{ marginTop: '1rem' }}>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.cassandra.mean_ms)} ms</div>
                  <div className="metric-label">Mean Staleness</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.cassandra.median_ms)} ms</div>
                  <div className="metric-label">Median</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.cassandra.p95_ms)} ms</div>
                  <div className="metric-label">P95</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.cassandra.p99_ms)} ms</div>
                  <div className="metric-label">P99</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">
                    {(results.cassandra.stale_ratio * 100).toFixed(1)}%
                  </div>
                  <div className="metric-label">Stale Read Ratio</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.cassandra.max_ms)} ms</div>
                  <div className="metric-label">Max</div>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                {badge(results.cassandra.stale_ratio)}
              </div>
            </div>

            {/* MongoDB card */}
            <div className="card">
              <h2 style={{ color: '#00d4ff' }}>
                <ShieldCheck className="w-6 h-6" />
                MongoDB —{' '}
                {results.config.mongo_read_secondary ? 'Secondary Read' : 'Primary Read'}
              </h2>
              <div className="grid grid-cols-2 gap-4" style={{ marginTop: '1rem' }}>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.mongodb.mean_ms)} ms</div>
                  <div className="metric-label">Mean Staleness</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.mongodb.median_ms)} ms</div>
                  <div className="metric-label">Median</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.mongodb.p95_ms)} ms</div>
                  <div className="metric-label">P95</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.mongodb.p99_ms)} ms</div>
                  <div className="metric-label">P99</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">
                    {(results.mongodb.stale_ratio * 100).toFixed(1)}%
                  </div>
                  <div className="metric-label">Stale Read Ratio</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{fmt(results.mongodb.max_ms)} ms</div>
                  <div className="metric-label">Max</div>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                {badge(results.mongodb.stale_ratio)}
              </div>
            </div>
          </section>

          {/* charts */}
          <section className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2>
                <BarChart3 className="w-6 h-6" />
                Staleness Distribution (ms)
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={latencyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="metric" stroke="#a0a0a0" fontSize={12} />
                    <YAxis stroke="#a0a0a0" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="MongoDB" fill="#00d4ff" name="MongoDB" />
                    <Bar dataKey="Cassandra" fill="#00ff88" name="Cassandra" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h2>
                <AlertTriangle className="w-6 h-6" />
                Stale Read Ratio (%)
              </h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={staleRatioData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="db" stroke="#a0a0a0" fontSize={12} />
                    <YAxis
                      stroke="#a0a0a0"
                      fontSize={12}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      formatter={(v: any) => [`${v}%`, 'Stale Read Ratio']}
                    />
                    <Bar dataKey="Stale Ratio (%)" fill="#ffd93d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* interpretation */}
          <section className="card">
            <h2>
              <Clock className="w-6 h-6" />
              Interpretation
            </h2>
            <p style={{ color: '#a0a0a0', lineHeight: '1.7', marginTop: '0.5rem' }}>
              <strong style={{ color: '#fff' }}>Configuration:</strong>{' '}
              {results.config.iterations} iterations · {results.config.write_delay_ms} ms delay ·
              Cassandra {results.config.consistency} ·
              MongoDB {results.config.mongo_read_secondary ? 'secondary' : 'primary'} read ·
              Completed {new Date(results.completed_at).toLocaleString()}
            </p>
            <p style={{ color: '#a0a0a0', lineHeight: '1.7', marginTop: '0.75rem' }}>
              <strong style={{ color: '#00ff88' }}>Cassandra</strong> mean staleness of{' '}
              <strong style={{ color: '#fff' }}>{fmt(results.cassandra.mean_ms)} ms</strong> under{' '}
              {results.config.consistency} reflects the combined write round-trip and
              any replication lag to the replica selected by the round-robin policy.
              Raising to QUORUM tightens the tail distribution by requiring a majority
              acknowledgement, eliminating lagging-replica outliers.
            </p>
            <p style={{ color: '#a0a0a0', lineHeight: '1.7', marginTop: '0.75rem' }}>
              <strong style={{ color: '#00d4ff' }}>MongoDB</strong> mean staleness of{' '}
              <strong style={{ color: '#fff' }}>{fmt(results.mongodb.mean_ms)} ms</strong>{' '}
              {results.config.mongo_read_secondary
                ? 'on secondary reads reflects asynchronous oplog replication lag. Switch to primary read to eliminate staleness at the cost of read load concentration.'
                : 'on primary reads confirms near-zero staleness — the primary always serves the most recent write.'}
            </p>
          </section>
        </>
      )}
    </div>
  );
};