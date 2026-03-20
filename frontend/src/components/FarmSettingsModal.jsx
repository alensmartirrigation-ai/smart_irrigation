import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { Settings, MessageSquare, Loader, Save, CheckSquare, Square } from 'lucide-react';

const FarmSettingsModal = ({ isOpen, onClose, farm, onSettingsUpdated }) => {
  const [waEnabled, setWaEnabled] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [credentials, setCredentials] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (farm && isOpen) {
      setCredentials(farm.credentials || {});
      const fetchChannels = async () => {
         try {
           const token = localStorage.getItem('token');
           const res = await axios.get(`/api/farms/${farm.id}/channels`, {
              headers: { Authorization: `Bearer ${token}` }
           });
           const channels = res.data;
           const wa = channels.find(c => c.provider === 'whatsapp');
           const tg = channels.find(c => c.provider === 'telegram');
           
           setWaEnabled(wa ? wa.enabled : farm.message_platform === 'whatsapp');
           setTgEnabled(tg ? tg.enabled : farm.message_platform === 'telegram');
         } catch (err) {
           console.error('Failed to load farm channels', err);
         }
      };
      fetchChannels();
    }
  }, [farm, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Update channels
      await axios.put(`/api/farms/${farm.id}/channels`, { provider: 'whatsapp', enabled: waEnabled }, { headers });
      await axios.put(`/api/farms/${farm.id}/channels`, { provider: 'telegram', enabled: tgEnabled }, { headers });

      // Mirror to legacy farm object just in case
      const legacyPlatform = waEnabled ? 'whatsapp' : (tgEnabled ? 'telegram' : 'whatsapp');
      await axios.put(`/api/farms/${farm.id}`, { message_platform: legacyPlatform, credentials }, { headers });
      
      onSettingsUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update farm settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialChange = (key, value) => {
    setCredentials({
      ...credentials,
      [key]: value
    });
  };

  if (!farm) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Settings: ${farm.name}`}>
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="settings-section">
          <h4 style={{ color: 'var(--nm-accent)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <MessageSquare size={18} /> Active Channels
          </h4>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
               <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
               WhatsApp
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
               <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
               Telegram
            </label>
          </div>
        </div>

        {waEnabled && (
          <div className="settings-section">
            <h4 style={{ color: 'var(--nm-accent)', marginBottom: '15px' }}>WhatsApp Legacy Options</h4>
            <div className="input-field-nm" style={{ marginBottom: '15px' }}>
              <input 
                type="text" 
                placeholder="Instance ID" 
                value={credentials.instanceId || ''} 
                onChange={(e) => handleCredentialChange('instanceId', e.target.value)}
              />
            </div>
            <div className="input-field-nm">
              <input 
                type="text" 
                placeholder="Token" 
                value={credentials.token || ''} 
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
