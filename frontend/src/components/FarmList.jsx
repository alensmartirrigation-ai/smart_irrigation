import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trees as Farm, Search, RefreshCw, Plus, Activity, Trash2, Settings } from 'lucide-react';
import AddFarmModal from './AddFarmModal';
import FarmSettingsModal from './FarmSettingsModal';
import './FarmList.css';

const FarmList = () => {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'admin');
    fetchFarms();
  }, []);

  const fetchFarms = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/farms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFarms(response.data);
    } catch (err) {
      console.error('Error fetching farms:', err);
      setError('Failed to load farms.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this farm?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/farms/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchFarms();
    } catch (err) {
      alert('Failed to delete farm');
    }
  };

  const filteredFarms = farms.filter(farm => 
    farm.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="farm-list-container">
      <div className="farm-list-controls">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search farms..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="action-buttons">
          <button className="refresh-btn" onClick={fetchFarms} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
          {isAdmin && (
            <button className="add-btn-nm" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              <span>Add Farm</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="farm-list-state">
          <div className="spinner"></div>
          <p>Loading farms...</p>
        </div>
      ) : error ? (
        <div className="farm-list-state error">
          <p>{error}</p>
          <button onClick={fetchFarms}>Retry</button>
        </div>
      ) : filteredFarms.length === 0 ? (
        <div className="farm-list-state">
          <p>No farms found.</p>
        </div>
      ) : (
        <div className="farm-grid">
          {filteredFarms.map(farm => (
            <div key={farm.id} className="farm-card">
              <div className="farm-card-header">
                <div className="farm-icon">
                  <Farm size={24} />
                </div>
                <div className={`status-badge ${farm.connection_status || 'disconnected'}`}>
                  <Activity size={12} />
                  <span>{farm.connection_status || 'offline'}</span>
                </div>
              </div>
              <div className="farm-card-body">
                <h3>{farm.name}</h3>
                <p className="farm-id">ID: {farm.id.substring(0, 8)}...</p>
                <p className="platform">Platform: {farm.message_platform || 'N/A'}</p>
              </div>
              {isAdmin && (
                <>
                  <div className="card-actions">
                    <button className="delete-btn-nm" onClick={() => handleDelete(farm.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <button 
                    className="settings-btn-nm" 
                    onClick={() => {
                      setSelectedFarm(farm);
                      setIsSettingsOpen(true);
                    }}
                  >
                    <Settings size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <AddFarmModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onFarmAdded={fetchFarms} 
      />

      <FarmSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setSelectedFarm(null);
        }}
        farm={selectedFarm}
        onSettingsUpdated={fetchFarms}
      />
    </div>
  );
};

export default FarmList;
