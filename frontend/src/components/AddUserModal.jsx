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
    farmId: ''
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
      if (!value.startsWith('+91 ')) {
        return;
      }
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.farmId) {
      setError('Please select a farm');
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
      setFormData({ name: '', username: '', phone: '+91 ', role: 'user', password: '', farmId: '' });
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

        <div className="input-field-nm">
          <MapPin size={18} />
          <select name="farmId" value={formData.farmId} onChange={handleChange} required>
            <option value="" disabled>Select Farm *</option>
            {farms.map(farm => (
              <option key={farm.id} value={farm.id}>{farm.name}</option>
            ))}
          </select>
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
