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
    // Socket connection and global status fetch - runs once
    const socket = io(); 
    
    // Initial fetch
    const fetchStatus = async () => {
      try {
        const response = await axios.get('/api/whatsapp/status');
        // Only set initial global status if no farm is selected yet
        // If a farm IS selected, the other useEffect will handle overwriting this shortly, 
        // but to avoid flicker we can check here too, or just let it update global state
        if (!selectedFarm) {
             setStatus(response.data.status);
        }
        setQrCode(response.data.qr);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch WhatsApp status:', err);
        setLoading(false);
      }
    };

    fetchStatus();

    socket.on('whatsapp_status', (newStatus) => {
      // If we are viewing a specific farm, we generally want to trust the farm's status 
      // BUT if the global system disconnects, the farm is effectively disconnected too.
      // So updating status here is valid for 'disconnected' events.
      // For 'connected' events, we might want to wait for the specific farm update event 
      // (which comes via FarmSelector -> prop update), but seeing "Connected" globally is also good feedback.
      if (!selectedFarm) {
          setStatus(newStatus);
      }
      if (newStatus === 'connected') setQrCode(null);
    });

    socket.on('whatsapp_qr', (qr) => {
      setQrCode(qr);
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []); // Empty dependency array - runs once

  useEffect(() => {
    // React to selectedFarm changes
    if (selectedFarm) {
        setStatus(selectedFarm.connection_status || 'disconnected');
    }
  }, [selectedFarm]);

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to logout from WhatsApp?')) return;
    try {
      await axios.post('/api/whatsapp/logout');
      setStatus('disconnected');
      setQrCode(null);
    } catch (err) {
      alert('Failed to logout');
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
            <button className="action-btn-nm" onClick={() => window.location.reload()} disabled={loading}>
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
