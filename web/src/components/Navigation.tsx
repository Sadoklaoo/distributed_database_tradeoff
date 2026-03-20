import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Database,
  HardDrive,
  Activity,
  AlertTriangle,
  Menu,
  X,
  Clock,
  Gauge,
  FileText,
  ChevronRight,
} from 'lucide-react';

export const Navigation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navRef = React.useRef<HTMLDivElement | null>(null);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const navItems = useMemo(
    () => [
      {
        label: 'Overview',
        icon: BarChart3,
        subItems: [{ path: '/', label: 'Dashboard' }],
      },
      { label: 'MongoDB', icon: Database, path: '/mongodb' },
      { label: 'Cassandra', icon: HardDrive, path: '/cassandra' },
      {
        label: 'Performance',
        icon: Activity,
        subItems: [
          { path: '/performance', label: 'Performance' },
          { path: '/batch-run', label: 'Batch Run' },
          { path: '/history', label: 'History' },
        ],
      },
      {
        label: 'Testing',
        icon: AlertTriangle,
        subItems: [
          { path: '/failure-testing', label: 'Failure Testing' },
          { path: '/staleness', label: 'Staleness' },
          { path: '/staleness-history', label: 'Staleness History' },
        ],
      },
    ],
    []
  );

  const isActivePath = (path: string) => {
    if (path === '/') return location.pathname === '/';
    // Avoid prefix collisions (e.g., '/staleness' should not match '/staleness-history')
    return (
      location.pathname === path ||
      location.pathname.startsWith(path + '/')
    );
  };

  const isItemActive = (item: typeof navItems[number]) => {
    if (item.path) return isActivePath(item.path);
    if (!item.subItems) return false;
    return item.subItems.some((sub) => isActivePath(sub.path));
  };

  const closeMenus = () => {
    setIsOpen(false);
    setOpenDropdown(null);
  };

  const toggleDropdown = (label: string) => {
    setOpenDropdown((prev) => (prev === label ? null : label));
  };

  useEffect(() => {
    const active = navItems.find(isItemActive);
    if (active && active.subItems) {
      setOpenDropdown(active.label);
    }
  }, [location.pathname, navItems]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

        <div ref={navRef} className={`navbar-menu ${isOpen ? 'navbar-menu-open' : ''}`}>
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const hasSubItems = !!item.subItems?.length;
            const itemOpen = openDropdown === item.label;
            const isActive = isItemActive(item);

            return (
              <div
                key={item.label}
                className="nav-group"
                data-open={itemOpen ? 'true' : 'false'}
              >
                {hasSubItems ? (
                  <button
                    type="button"
                    className="nav-group-header"
                    onClick={() => toggleDropdown(item.label)}
                  >
                    <ItemIcon className="w-5 h-5" />
                    <span>{item.label}</span>
                    <ChevronRight
                      className={`w-4 h-4 nav-group-chevron ${itemOpen ? 'open' : ''}`}
                    />
                  </button>
                ) : (
                  <Link
                    to={item.path!}
                    className={`navbar-link ${isActive ? 'navbar-link-active' : ''}`}
                    onClick={closeMenus}
                  >
                    <ItemIcon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                )}

                {hasSubItems && (
                  <div className="nav-group-items">
                    {item.subItems!.map((sub) => (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        className={`navbar-link ${isActivePath(sub.path) ? 'navbar-link-active' : ''}`}
                        onClick={closeMenus}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
