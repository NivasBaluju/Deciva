import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';
import { DURATIONS, EASE_OUT } from '../../styles/motion';

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const pathname = location.pathname;

  const navItems = [
    { path: '/dashboard', icon: <Icon.grid />, label: 'Dashboard' },
    { path: '/portfolio', icon: <Icon.trending />, label: 'Portfolio Oversight' },
    { path: '/deadlines', icon: <Icon.clock />, label: 'Deadlines & Milestones' },
    { path: '/documents', icon: <Icon.document />, label: 'Documents' },
    { path: '/upload', icon: <Icon.upload />, label: 'Upload Document' },
    { path: '/contracts', icon: <Icon.pen />, label: 'Generate Contract' },
    { path: '/integrations', icon: <Icon.zap />, label: 'Integrations' },
  ];

  const secItems = [
    { path: '/security', icon: <Icon.shield />, label: 'Security & Ledger' },
    ...(user?.role === 'admin'
      ? [{ path: '/operations', icon: <Icon.settings />, label: 'Operations & DR' }]
      : []),
  ];

  const isDocDetail = pathname.startsWith('/document/');

  const isItemActive = (itemPath) => {
    if (itemPath === '/documents' && isDocDetail) return true;
    return pathname === itemPath || pathname.startsWith(itemPath + '/');
  };

  const renderNavButton = (item) => {
    const active = isItemActive(item.path);
    return (
      <button
        key={item.path}
        className={`sidebar-item ${active ? 'active' : ''}`}
        onClick={() => navigate(item.path)}
      >
        {item.icon}
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-label">Menu</div>
      {navItems.map(renderNavButton)}

      <div className="sidebar-divider" />

      <div className="sidebar-label">Security</div>
      {secItems.map(renderNavButton)}

      <div className="sidebar-bottom">
        <button className="sidebar-item" onClick={logout}>
          <Icon.logout /> Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
