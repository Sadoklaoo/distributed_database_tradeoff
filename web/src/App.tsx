import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { MongoDB } from './pages/MongoDB';
import { Cassandra } from './pages/Cassandra';

export const App: React.FC = () => {
  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mongodb" element={<MongoDB />} />
          <Route path="/cassandra" element={<Cassandra />} />
        </Routes>
      </main>
    </div>
  );
};


