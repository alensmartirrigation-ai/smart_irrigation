import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { User, Phone, Shield, Lock, Loader, Eye, EyeOff, MapPin } from 'lucide-react';

const AddUserModal = ({ isOpen, onClose, onUserAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    phone: '+91 ',
    role: 'user',
    password: '',
    farmIds: []
  });
  const [farms, setFarms] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchFarms();
    }
  }, [isOpen]);

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
    if (name === 'phone') {
      // Enforce +91 prefix
      if (!value.startsWith('+91 ')) {
        return;
      }
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleFarmToggle = (farmId) => {
    setFormData(prev => {
      const currentIds = prev.farmIds;
      if (currentIds.includes(farmId)) {
        return { ...prev, farmIds: currentIds.filter(id => id !== farmId) };
      } else {
        return { ...prev, farmIds: [...currentIds, farmId] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.farmIds.length === 0) {
      setError('Please select at least one farm');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/users', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onUserAdded();
      onClose();
      setFormData({ name: '', username: '', phone: '+91 ', role: 'user', password: '', farmIds: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New User">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="input-field-nm">
          <User size={18} />
          <input
            type="text"
            name="name"
            placeholder="Full Name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="input-field-nm">
          <User size={18} />
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>
        <div className="input-field-nm">
          <Phone size={18} />
          <input
            type="text"
            name="phone"
            placeholder="Phone Number"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>
        <div className="input-field-nm">
          <Lock size={18} />
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <button 
            type="button" 
            className="password-toggle-btn" 
            onClick={() => setShowPassword(!showPassword)}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: 'var(--nm-text-light)',
              display: 'flex',
              alignItems: 'center',
              padding: '0'
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="input-field-nm">
          <Shield size={18} />
          <select name="role" value={formData.role} onChange={handleChange}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="farm-select-section">
          <div className="farm-select-header">
            <MapPin size={18} />
            <span>Assign Farms <span style={{ color: 'var(--nm-danger, #e74c3c)' }}>*</span></span>
          </div>
          <div className="farm-checkbox-list">
            {farms.length === 0 ? (
              <p style={{ color: 'var(--nm-text-light)', fontSize: '0.85rem', padding: '8px 0' }}>
                No farms available. Please create a farm first.
              </p>
            ) : (
              farms.map(farm => (
                <label key={farm.id} className={`farm-checkbox-item ${formData.farmIds.includes(farm.id) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={formData.farmIds.includes(farm.id)}
                    onChange={() => handleFarmToggle(farm.id)}
                  />
                  <span className="farm-checkbox-name">{farm.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="submit-btn-nm" disabled={loading}>
          {loading ? <Loader className="spinning" size={20} /> : 'Create User'}
        </button>
      </form>
    </Modal>
  );
};

export default AddUserModal;
