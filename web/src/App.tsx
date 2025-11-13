import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { MongoDB } from './pages/MongoDB';
import { Cassandra } from './pages/Cassandra';
import { Performance } from './pages/Performance';
import { FailureTesting } from './pages/FailureTesting';
import { PerformanceHistory } from './pages/PerformanceHistory';

export const App: React.FC = () => {
  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mongodb" element={<MongoDB />} />
          <Route path="/cassandra" element={<Cassandra />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/history" element={<PerformanceHistory />} />
          <Route path="/failure-testing" element={<FailureTesting />} />
        </Routes>
      </main>
    </div>
  );
};


