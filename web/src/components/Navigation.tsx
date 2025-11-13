import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  BarChart3, 
  Database, 
  HardDrive, 
  Activity,
  AlertTriangle,
  Menu, 
  X, 
  Clock
} from 'lucide-react';

export const Navigation: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: BarChart3 },
    { path: '/mongodb', label: 'MongoDB', icon: Database },
    { path: '/cassandra', label: 'Cassandra', icon: HardDrive },
    { path: '/performance', label: 'Performance', icon: Activity },
    { path: '/history', label: 'Performance History', icon: Clock },
    { path: '/failure-testing', label: 'Failure Testing', icon: AlertTriangle },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <Database className="w-8 h-8" />
          <span>DB Dashboard</span>
        </Link>

        <button 
          className="navbar-toggle"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        <div className={`navbar-menu ${isOpen ? 'navbar-menu-open' : ''}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`navbar-link ${isActive(item.path) ? 'navbar-link-active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
