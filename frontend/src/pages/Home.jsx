import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sprout, LogOut } from 'lucide-react';
import { logout } from '../utils/auth';

const Home = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="whatsapp-container" style={{ textAlign: 'center' }}>
      <header className="main-header" style={{ position: 'relative' }}>
        <button 
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ 
                position: 'absolute', 
                top: 0, 
                right: 0, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                fontSize: '0.9rem',
                padding: '0.5rem 1rem'
            }}
        >
            <LogOut size={16} /> Logout
        </button>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <Sprout size={64} className="text-green-500" />
        </div>
        <h1>Smart Irrigation System</h1>
        <p>Monitor and control your farm's irrigation.</p>
      </header>

      <div className="card-container">
        <div className="card glass-card">
            <h3>Welcome Admin</h3>
            <p style={{ marginBottom: '20px', color: '#94a3b8' }}>Configure system alert settings and integrations.</p>
            <Link to="/admin/onboarding" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                Go to Admin Onboarding
            </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
