import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Smartphone, QrCode, Shield, RefreshCw, CheckCircle, LogOut } from 'lucide-react';
import './PlatformSettings.css';

const PlatformSettings = ({ selectedFarm }) => {
  const [status, setStatus] = useState('initializing');
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!selectedFarm) return;

    const farmId = selectedFarm.id;
    const socketUrl = import.meta.env.DEV ? 'http://localhost:4000' : '';
    const socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('connect', () => console.log('[WhatsApp] Socket connected to backend'));
    socket.on('connect_error', (err) => console.warn('[WhatsApp] Socket error', err?.message));

    const fetchStatus = async () => {
      try {
        const response = await axios.get(`/api/whatsapp/status?farmId=${farmId}&_t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
        setStatus(response.data.status);
        const qr = response.data.qr ?? null;
        if (qr) console.log('[WhatsApp] QR received (poll)', { farmId, status: response.data.status });
        setQrCode((prev) => (response.data.status === 'connected' ? null : (qr ?? prev)));
        setLoading(false);
        if (response.data.status === 'connected' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        console.error('Failed to fetch WhatsApp status:', err);
        setStatus('disconnected');
        setLoading(false);
      }
    };

    setLoading(true);
    fetchStatus();

    socket.on('whatsapp_status', (data) => {
      if (String(data.farmId) !== String(farmId)) return;
      setStatus(data.status);
      if (data.status === 'connected') {
        setQrCode(null);
        setLoading(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    });

    socket.on('whatsapp_qr', (data) => {
      if (String(data.farmId) !== String(farmId)) return;
      if (data.qr) console.log('[WhatsApp] QR received (socket)', { farmId });
      setQrCode(data.qr);
      setLoading(false);
    });

    pollRef.current = setInterval(fetchStatus, 1500);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      socket.disconnect();
    };
  }, [selectedFarm]);

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to logout from WhatsApp?')) return;
    if (!selectedFarm) return;
    
    try {
      await axios.post('/api/whatsapp/logout', { farmId: selectedFarm.id });
      setStatus('disconnected');
      setQrCode(null);
    } catch (err) {
      alert('Failed to logout');
      console.error(err);
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'qr_pending':
      case 'scanning': return 'QR Ready';
      case 'disconnected': return 'Disconnected';
      case 'connecting': return 'Connecting...';
      default: return 'Initializing...';
    }
  };

  const handleReconnect = async () => {
    if (!selectedFarm) return;
    setLoading(true);
    try {
      await axios.post('/api/whatsapp/reconnect', { farmId: selectedFarm.id });
    } catch (err) {
      console.error('Failed to reconnect:', err);
      setLoading(false);
    }
  };

  const handleForceNewQr = async () => {
    if (!selectedFarm) return;
    if (!window.confirm('Generate a new QR code? The current WhatsApp link will be disconnected and you’ll need to scan the new code to link again.')) return;
    setLoading(true);
    setQrCode(null);
    try {
      await axios.post('/api/whatsapp/logout', { farmId: selectedFarm.id });
      setStatus('connecting');
      // Backend will init and emit new QR via socket; polling will also pick it up
    } catch (err) {
      console.error('Failed to force new QR:', err);
      setLoading(false);
    }
  };

  return (
    <div className="platform-settings-container">
      <div className="settings-card">
        <div className="settings-header">
          <Smartphone size={32} className="header-icon" />
          <div className="header-text">
            <h3>WhatsApp Connection</h3>
            <p>
              {status === 'connected' 
                ? 'Your account is linked to the Smart Irrigation system.' 
                : 'Scan the QR code to link your account to the Smart Irrigation system.'}
            </p>
          </div>
          <div className={`status-pill ${status}`}>
            <span>{getStatusText()}</span>
          </div>
        </div>

        <div className="qr-section">
          <div className="qr-container">
            {loading ? (
              <div className="qr-loader">
                <RefreshCw size={48} className="spinning" />
                <span>Initializing...</span>
              </div>
            ) : status === 'connected' ? (
              <div className="qr-success">
                <CheckCircle size={80} color="#4CAF50" />
                <h4>Linked Successfully</h4>
                <p>Receiving alerts and monitoring farm data.</p>
              </div>
            ) : qrCode ? (
              <div className="qr-image-wrapper">
                <img src={qrCode} alt="WhatsApp QR Code" className="whatsapp-qr" />
              </div>
            ) : (
              <div className="qr-placeholder">
                <QrCode size={180} strokeWidth={1} />
                <div className="qr-overlay">
                  <p>Waiting for QR code...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-actions">
          {status === 'connected' ? (
            <>
              <button className="action-btn-nm logout" onClick={handleLogout}>
                <LogOut size={18} />
                <span>Disconnect WhatsApp</span>
              </button>
              <button className="action-btn-nm secondary" onClick={handleForceNewQr} disabled={loading}>
                <QrCode size={18} />
                <span>Force new QR</span>
              </button>
            </>
          ) : (
            <>
              <button className="action-btn-nm" onClick={handleReconnect} disabled={loading}>
                <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                <span>Retry Connection</span>
              </button>
              <button className="action-btn-nm secondary" onClick={handleForceNewQr} disabled={loading}>
                <QrCode size={18} />
                <span>Force new QR</span>
              </button>
            </>
          )}
          <button className="action-btn-nm secondary">
            <Shield size={18} />
            <span>Session Logs</span>
          </button>
        </div>

        <div className="settings-footer">
          <p>System Status: {status} • Instance: WhatsApp-Primary</p>
        </div>
      </div>
    </div>
  );
};

export default PlatformSettings;
