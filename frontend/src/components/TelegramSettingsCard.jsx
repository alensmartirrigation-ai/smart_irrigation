import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Send, CheckCircle, RefreshCw, Layers } from 'lucide-react';
import './PlatformSettings.css'; // Reuse existing styles

const TelegramSettingsCard = ({ selectedFarm }) => {
    const [status, setStatus] = useState('initializing');
    const [botInfo, setBotInfo] = useState(null);
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        if (!selectedFarm) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const [globalStatusRes, channelsRes] = await Promise.all([
                axios.get('/api/telegram/status', { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/farms/${selectedFarm.id}/channels`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const globalData = globalStatusRes.data;
            const channels = channelsRes.data;
            const tgChannel = channels.find(c => c.provider === 'telegram');

            setStatus(globalData.status);
            setBotInfo(globalData.botUsername);
            setEnabled(tgChannel ? tgChannel.enabled : false);
        } catch (err) {
            console.error('Failed to fetch Telegram status', err);
            setStatus('disconnected');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [selectedFarm]);

    const handleSendTest = async () => {
        try {
            const chatId = prompt('Enter Telegram Chat ID to send test message to:');
            if (!chatId) return;
            const token = localStorage.getItem('token');
            await axios.post('/api/telegram/send-test', { chatId }, { headers: { Authorization: `Bearer ${token}` } });
            alert('Test message sent!');
        } catch (err) {
            alert('Failed to send test message');
        }
    };

    const handleReconnect = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/telegram/reconnect', {}, { headers: { Authorization: `Bearer ${token}` } });
            fetchStatus();
        } catch (err) {
            console.error('Reconnect failed', err);
            setLoading(false);
        }
    };

    const isReady = !!selectedFarm;

    return (
        <div className="settings-card telegram-card" style={{ opacity: isReady ? 1 : 0.5, pointerEvents: isReady ? 'auto' : 'none' }}>
            <div className="settings-header">
              <Send size={32} className="header-icon" color="#0088cc" />
              <div className="header-text">
                <h3>Telegram Bot</h3>
                <p>
                  Global Webhook Status: <strong>{status}</strong>
                </p>
              </div>
              <div className={`status-pill ${status}`}>
                <span>{status === 'connected' ? 'Healthy' : 'Disconnected'}</span>
              </div>
            </div>

            <div className="qr-section">
               <div className="qr-container telegram-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '180px', padding: '20px', gap: '15px' }}>
                  {loading ? (
                      <div className="qr-loader">
                        <RefreshCw size={40} className="spinning" />
                      </div>
                  ) : status === 'connected' ? (
                      <>
                        <CheckCircle size={60} color="#0088cc" />
                        <h4 style={{ margin: 0 }}>Webhook Active</h4>
                        <p style={{ margin: 0, textAlign: 'center', color: 'var(--nm-text-muted)' }}>
                           Bot Username: <strong>@{botInfo || 'unknown'}</strong><br/>
                           Farm Enabled: <strong>{enabled ? 'Yes' : 'No'}</strong>
                        </p>
                      </>
                  ) : (
                      <>
                        <Layers size={60} color="var(--nm-border)" />
                        <h4 style={{ margin: 0 }}>Webhook Offline</h4>
                        <p style={{ margin: 0, textAlign: 'center', color: 'var(--nm-text-muted)' }}>
                           Ensure TELEGRAM_WEBHOOK_URL is set in environment.
                        </p>
                      </>
                  )}
               </div>
            </div>

            <div className="settings-actions">
              <button className="action-btn-nm" onClick={handleReconnect} disabled={loading}>
                 <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                 <span>Sync Webhook</span>
              </button>
              <button className="action-btn-nm secondary" onClick={handleSendTest} disabled={loading || status !== 'connected'}>
                 <Send size={18} />
                 <span>Send Test Msg</span>
              </button>
            </div>
            
            <div className="settings-footer">
              <p>System Status: {status} • Bot Username: @{botInfo || 'N/A'}</p>
            </div>
        </div>
    );
};

export default TelegramSettingsCard;
