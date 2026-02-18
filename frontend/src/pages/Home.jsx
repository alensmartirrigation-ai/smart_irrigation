import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Trees as Farm, 
  Cpu, 
  Settings, 
  LogOut, 
  User,
  Sprout,
  Smartphone
} from 'lucide-react';
import { logout } from '../utils/auth';
import UserList from '../components/UserList';
import FarmList from '../components/FarmList';
import DashboardHeader from '../components/DashboardHeader';
import FarmSelector from '../components/FarmSelector';
import PlatformSettings from '../components/PlatformSettings';
import DeviceList from '../components/DeviceList';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [selectedFarm, setSelectedFarm] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { id: 'users', label: 'Users', icon: <Users size={20} /> },
    { id: 'devices', label: 'Devices', icon: <Cpu size={20} /> },
    { id: 'platform-settings', label: 'Platform Settings', icon: <Smartphone size={20} /> },
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
        <DashboardHeader 
          title="Dashboard" 
          subtitle="Welcome to the Smart Irrigation control center. Manage users, track farms, and monitor connected devices from this centralized hub."
        >
          <FarmSelector 
            selectedFarm={selectedFarm} 
            onSelectFarm={setSelectedFarm} 
          />
          <div className="profile-img-placeholder">
            <User size={28} />
          </div>
        </DashboardHeader>

        {/* Content Body */}
        <div className="content-body">
          <div className="dashboard-main-area">
            <h2 className="active-tab-title">
              {navItems.find(t => t.id === activeTab)?.label}
            </h2>
            
            <div className="tab-content-container">
              {activeTab === 'users' ? <UserList /> : 
               activeTab === 'devices' ? <DeviceList selectedFarm={selectedFarm} /> :
               activeTab === 'platform-settings' ? (
                 <PlatformSettings selectedFarm={selectedFarm} /> 
               ) : (
                <div className="tab-placeholder">
                  Displaying management interface for {activeTab}...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
