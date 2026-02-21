import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Cpu, MapPin, Search, RefreshCw, Plus, Trash2, Trees as Farm, Edit, Droplets } from 'lucide-react';
import AddDeviceModal from './AddDeviceModal';
import DeviceGraphModal from './DeviceGraphModal';
import './DeviceList.css';

const DeviceList = ({ selectedFarm }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [selectedDeviceForGraph, setSelectedDeviceForGraph] = useState(null);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [irrigationLoading, setIrrigationLoading] = useState({});
  const [durations, setDurations] = useState({});

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

  const handleCardClick = (device) => {
    setSelectedDeviceForGraph(device);
    setIsGraphModalOpen(true);
  };
 
  const handleDelete = async (e, id) => {
    e.stopPropagation();
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

  const handleIrrigate = async (e, id) => {
    e.stopPropagation();
    const duration = durations[id] || 60;
    setIrrigationLoading(prev => ({ ...prev, [id]: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/devices/${id}/start-irrigation`, { duration: parseInt(duration) }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDevices(); // Refresh to get updated status
    } catch (err) {
      console.error('Irrigation failed:', err);
      alert(err.response?.data?.error || 'Failed to trigger irrigation');
    } finally {
      setIrrigationLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleStopIrrigation = async (e, id) => {
    e.stopPropagation();
    setIrrigationLoading(prev => ({ ...prev, [id]: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/devices/${id}/stop-irrigation`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDevices();
    } catch (err) {
      console.error('Stop irrigation failed:', err);
      alert(err.response?.data?.error || 'Failed to stop irrigation');
    } finally {
      setIrrigationLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDurationChange = (id, value) => {
    setDurations(prev => ({ ...prev, [id]: value }));
  };

  const handleEdit = (e, device) => {
    e.stopPropagation();
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
            <div key={device.id} className="device-card" onClick={() => handleCardClick(device)} style={{ cursor: 'pointer' }}>
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
                <div className="device-info-row">
                  <Droplets size={14} />
                  <span>Threshold: {device.moisture_threshold}%</span>
                </div>
              </div>

              <div className="device-card-center" onClick={(e) => e.stopPropagation()}>
                {device.DeviceIrrigationStatus?.last_irrigated_at && (
                  <div className="irrigation-status-info">
                    {new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now() ? (
                      <span className="pulsing-droplet">Irrigating...</span>
                    ) : (
                      <span>Last: {new Date(device.DeviceIrrigationStatus.last_irrigated_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    )}
                  </div>
                )}
                
                <div className="irrigation-controls">
                  <input 
                    type="number" 
                    className="duration-input-nm"
                    placeholder="Secs"
                    value={durations[device.id] || 60}
                    onChange={(e) => handleDurationChange(device.id, e.target.value)}
                    min="1"
                    disabled={irrigationLoading[device.id]}
                  />
                  <button 
                    className={`irrigate-btn-nm ${irrigationLoading[device.id] ? 'loading' : ''} ${device.DeviceIrrigationStatus?.last_irrigated_at && new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now() ? 'stop' : 'start'}`}
                    onClick={(e) => {
                      const isIrrigating = device.DeviceIrrigationStatus?.last_irrigated_at && new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now();
                      if (isIrrigating) {
                        handleStopIrrigation(e, device.id);
                      } else {
                        handleIrrigate(e, device.id);
                      }
                    }}
                    disabled={irrigationLoading[device.id]}
                    title={device.DeviceIrrigationStatus?.last_irrigated_at && new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now() ? 'Stop Irrigation' : 'Start Irrigation'}
                  >
                    {irrigationLoading[device.id] ? (
                      <RefreshCw size={14} className="spinning" />
                    ) : (
                      device.DeviceIrrigationStatus?.last_irrigated_at && new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now() ? <RefreshCw size={14} /> : <Droplets size={14} />
                    )}
                    <span>{device.DeviceIrrigationStatus?.last_irrigated_at && new Date(device.DeviceIrrigationStatus.last_irrigated_at).getTime() + (device.DeviceIrrigationStatus.last_duration_seconds * 1000) > Date.now() ? 'Stop' : 'Start'}</span>
                  </button>
                </div>
              </div>
              
              <div className="device-actions-row" onClick={(e) => e.stopPropagation()}>
              </div>

              <button className="edit-btn-nm" onClick={(e) => handleEdit(e, device)}>
                <Edit size={16} />
              </button>
              <button className="delete-btn-nm" onClick={(e) => handleDelete(e, device.id)}>
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

      <DeviceGraphModal
        isOpen={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        device={selectedDeviceForGraph}
      />
    </div>
  );
};

export default DeviceList;
