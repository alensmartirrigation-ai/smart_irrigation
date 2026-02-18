import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Smartphone, QrCode, Shield, RefreshCw, CheckCircle, LogOut } from 'lucide-react';
import './PlatformSettings.css';

const PlatformSettings = ({ selectedFarm }) => {
  const [status, setStatus] = useState('initializing');
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedFarm) return;

    const socket = io();
    
    // Initial fetch for the specific farm
    const fetchStatus = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/whatsapp/status?farmId=${selectedFarm.id}`);
        setStatus(response.data.status);
        setQrCode(response.data.qr);
      } catch (err) {
        console.error('Failed to fetch WhatsApp status:', err);
        setStatus('disconnected');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    socket.on('whatsapp_status', (data) => {
      // Check if the event is for the current farm
      if (data.farmId === selectedFarm.id) {
          setStatus(data.status);
          if (data.status === 'connected') setQrCode(null);
      }
    });

    socket.on('whatsapp_qr', (data) => {
      if (data.farmId === selectedFarm.id) {
          setQrCode(data.qr);
          setLoading(false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedFarm]); // Re-run when selectedFarm changes

  // We don't need a separate useEffect for selectedFarm.connection_status anymore
  // because we fetch the source-of-truth status from the WhatsApp service directly 
  // when the farm changes. However, initially displayed status from the prop 
  // is faster, so we can initialize state with it if we want, but the fetch is safer.

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
      case 'scanning': return 'QR Ready';
      case 'disconnected': return 'Disconnected';
      default: return 'Initializing...';
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
      await axios.post('/api/whatsapp/reconnect', { farmId: selectedFarm.id });
      // The socket event should update status to 'initializing'/'connecting' shortly
    } catch (err) {
      console.error('Failed to reconnect:', err);
      // Fallback reload if API fails? Or just show error?
      // window.location.reload(); 
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
            <button className="action-btn-nm logout" onClick={handleLogout}>
              <LogOut size={18} />
              <span>Disconnect WhatsApp</span>
            </button>
          ) : (
            <button className="action-btn-nm" onClick={handleReconnect} disabled={loading}>
              <RefreshCw size={18} className={loading ? 'spinning' : ''} />
              <span>Retry Connection</span>
            </button>
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
