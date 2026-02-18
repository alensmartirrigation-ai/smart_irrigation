import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Trees as Farm, 
  Cpu, 
  Settings, 
  LogOut, 
  User,
  Sprout
} from 'lucide-react';
import { logout } from '../utils/auth';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { id: 'users', label: 'Users', icon: <Users size={20} /> },
    { id: 'farms', label: 'Farms Attached', icon: <Farm size={20} /> },
    { id: 'devices', label: 'Devices', icon: <Cpu size={20} /> },
  ];

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sprout size={28} />
            <span>Smart Irrigation</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <div 
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="logout-section">
          <div className="nav-item" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="dashboard-header">
          <button className="header-action-btn" onClick={() => navigate('/settings')}>
            <Settings size={22} />
          </button>
          <div className="profile-img-placeholder">
            <User size={28} />
          </div>
        </header>

        {/* Content Body */}
        <div className="content-body">
          <div className="welcome-card">
            <h1>Admin Dashboard</h1>
            <p>
              Welcome to the Smart Irrigation control center. 
              Manage users, track farms, and monitor connected devices from this centralized hub.
            </p>
            
            <div style={{ marginTop: '20px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '16px', color: 'var(--nm-accent)' }}>
                {navItems.find(t => t.id === activeTab)?.label}
              </h2>
              <div style={{ 
                height: '200px', 
                background: 'var(--nm-bg)', 
                boxShadow: 'inset 6px 6px 12px var(--nm-shadow), inset -6px -6px 12px var(--nm-light)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--nm-text-light)'
              }}>
                Displaying management interface for {activeTab}...
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
