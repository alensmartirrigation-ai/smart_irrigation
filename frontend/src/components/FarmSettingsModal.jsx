import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { Settings, MessageSquare, Loader, Save } from 'lucide-react';

const FarmSettingsModal = ({ isOpen, onClose, farm, onSettingsUpdated }) => {
  const [formData, setFormData] = useState({
    message_platform: 'whatsapp',
    credentials: {}
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (farm) {
      setFormData({
        message_platform: farm.message_platform || 'whatsapp',
        credentials: farm.credentials || {}
      });
    }
  }, [farm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      // Assuming there's a PUT /api/farms/:id endpoint for updating
      await axios.put(`/api/farms/${farm.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onSettingsUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update farm settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialChange = (key, value) => {
    setFormData({
      ...formData,
      credentials: {
        ...formData.credentials,
        [key]: value
      }
    });
  };

  if (!farm) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Settings: ${farm.name}`}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="input-field-nm">
          <MessageSquare size={18} />
          <select 
            value={formData.message_platform} 
            onChange={(e) => setFormData({ ...formData, message_platform: e.target.value })}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
          </select>
        </div>

        {formData.message_platform === 'whatsapp' && (
          <div className="settings-section">
            <h4 style={{ color: 'var(--nm-accent)', marginBottom: '15px' }}>WhatsApp Config</h4>
            <div className="input-field-nm" style={{ marginBottom: '15px' }}>
              <input 
                type="text" 
                placeholder="Instance ID" 
                value={formData.credentials.instanceId || ''} 
                onChange={(e) => handleCredentialChange('instanceId', e.target.value)}
              />
            </div>
            <div className="input-field-nm">
              <input 
                type="text" 
                placeholder="Token" 
                value={formData.credentials.token || ''} 
                onChange={(e) => handleCredentialChange('token', e.target.value)}
              />
            </div>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="submit-btn-nm" disabled={loading}>
          {loading ? <Loader className="spinning" size={20} /> : (
            <>
              <Save size={18} style={{ marginRight: '8px' }} />
              Save Settings
            </>
          )}
        </button>
      </form>
    </Modal>
  );
};

export default FarmSettingsModal;
