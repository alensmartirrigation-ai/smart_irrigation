import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { Cpu, MapPin, Hash, Trees as Farm, Loader } from 'lucide-react';

const AddDeviceModal = ({ isOpen, onClose, onDeviceAdded, deviceToEdit = null }) => {
  const [formData, setFormData] = useState({
    device_name: '',
    model: '',
    location: '',
    farmId: ''
  });
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchFarms();
      if (deviceToEdit) {
        setFormData({
            device_name: deviceToEdit.device_name || '',
            model: deviceToEdit.model || '',
            location: deviceToEdit.location || '',
            farmId: deviceToEdit.Farms && deviceToEdit.Farms.length > 0 ? deviceToEdit.Farms[0].id : ''
        });
      } else {
        setFormData({ device_name: '', model: '', location: '', farmId: '' });
      }
    }
  }, [isOpen, deviceToEdit]);

  const fetchFarms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/farms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFarms(response.data);
    } catch (err) {
      console.error('Error fetching farms:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (deviceToEdit) {
        await axios.put(`/api/devices/${deviceToEdit.id}`, formData, {
            headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/devices', formData, {
            headers: { Authorization: `Bearer ${token}` }
        });
      }
      onDeviceAdded();
      onClose();
      // Reset form handled by useEffect on next open
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${deviceToEdit ? 'update' : 'add'} device`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={deviceToEdit ? "Edit Device" : "Add New Device"}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="input-field-nm">
          <Cpu size={18} />
          <input
            type="text"
            name="device_name"
            placeholder="Device Name"
            value={formData.device_name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="input-field-nm">
          <Hash size={18} />
          <input
            type="text"
            name="model"
            placeholder="Model (e.g., ESP32)"
            value={formData.model}
            onChange={handleChange}
            required
          />
        </div>
        <div className="input-field-nm">
          <MapPin size={18} />
          <input
            type="text"
            name="location"
            placeholder="Location (e.g., Greenhouse 1)"
            value={formData.location}
            onChange={handleChange}
          />
        </div>
        <div className="input-field-nm">
          <Farm size={18} />
          <select name="farmId" value={formData.farmId} onChange={handleChange}>
            <option value="">Select Farm (Optional)</option>
            {farms.map(farm => (
              <option key={farm.id} value={farm.id}>{farm.name}</option>
            ))}
          </select>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="submit-btn-nm" disabled={loading}>
          {loading ? <Loader className="spinning" size={20} /> : (deviceToEdit ? 'Update Device' : 'Create Device')}
        </button>
      </form>
    </Modal>
  );
};

export default AddDeviceModal;
