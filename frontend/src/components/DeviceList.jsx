import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Cpu, MapPin, Search, RefreshCw, Plus, Trash2, Trees as Farm, Edit } from 'lucide-react';
import AddDeviceModal from './AddDeviceModal';
import './DeviceList.css';

const DeviceList = ({ selectedFarm }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);

  useEffect(() => {
    fetchDevices();
  }, [selectedFarm]);

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = selectedFarm 
        ? `/api/devices?farmId=${selectedFarm.id}` 
        : '/api/devices';
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDevices(response.data.data); // accessing data.data based on controller response structure
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to load devices. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this device?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/devices/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete device');
    }
  };

  const handleEdit = (device) => {
    setEditingDevice(device);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingDevice(null);
  };

  const filteredDevices = devices.filter(device => 
    device.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="device-list-container">
      <div className="device-list-controls">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search devices..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="action-buttons">
          <button className="refresh-btn" onClick={fetchDevices} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
          <button className="add-btn-nm" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} />
            <span>Add Device</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="device-list-state">
          <div className="spinner"></div>
          <p>Loading devices...</p>
        </div>
      ) : error ? (
        <div className="device-list-state error">
          <p>{error}</p>
          <button onClick={fetchDevices}>Retry</button>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="device-list-state">
          <p>No devices found.</p>
        </div>
      ) : (
        <div className="device-grid">
          {filteredDevices.map(device => (
            <div key={device.id} className="device-card">
              <div className="device-card-header">
                <div className="device-icon">
                  <Cpu size={24} />
                </div>
                <div className="device-status-badge">
                  <span>Active</span> {/* Placeholder for status */}
                </div>
              </div>
              <div className="device-card-body">
                <h3>{device.device_name}</h3>
                <p className="device-model">{device.model}</p>
                <div style={{ fontSize: '10px', color: 'var(--nm-text-light)', marginBottom: '10px', opacity: 0.7 }}>
                  ID: {device.id}
                </div>
                <div className="device-info-row">
                  <MapPin size={14} />
                  <span>{device.location || 'Unknown Location'}</span>
                </div>
                {device.Farms && device.Farms.length > 0 && (
                   <div className="device-info-row">
                     <Farm size={14} />
                     <span>{device.Farms.map(f => f.name).join(', ')}</span>
                   </div>
                )}
              </div>
              <button className="edit-btn-nm" onClick={() => handleEdit(device)}>
                <Edit size={16} />
              </button>
              <button className="delete-btn-nm" onClick={() => handleDelete(device.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <AddDeviceModal 
        isOpen={isModalOpen} 
        onClose={handleModalClose} 
        onDeviceAdded={fetchDevices}
        deviceToEdit={editingDevice}
      />
    </div>
  );
};

export default DeviceList;
