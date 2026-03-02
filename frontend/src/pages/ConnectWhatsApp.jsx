import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ArrowLeft, Smartphone, QrCode, RefreshCw, CheckCircle, LogOut, ChevronDown } from 'lucide-react';
import '../components/PlatformSettings.css';
import './ConnectWhatsApp.css';

const ConnectWhatsApp = () => {
  const navigate = useNavigate();
  const [farms, setFarms] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState(null);
  const [status, setStatus] = useState('initializing');
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [farmDropdownOpen, setFarmDropdownOpen] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/farms', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setFarms(res.data || []);
        if (res.data?.length > 0 && !selectedFarm) {
          setSelectedFarm(res.data[0]);
        }
      })
      .catch((err) => console.error('Failed to fetch farms', err));
  }, []);

  useEffect(() => {
    if (!selectedFarm) return;

    const farmId = selectedFarm.id;
    const socketUrl = import.meta.env.DEV ? 'http://localhost:4000' : '';
    const socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });

    const fetchStatus = async () => {
      try {
        const response = await axios.get(`/api/whatsapp/status?farmId=${farmId}&_t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
        setStatus(response.data.status);
        const qr = response.data.qr ?? null;
        setQrCode((prev) => (response.data.status === 'connected' ? null : (qr ?? prev)));
        setLoading(false);
        if (response.data.status === 'connected' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
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
    if (!window.confirm('Disconnect WhatsApp and show a new QR code?')) return;
    if (!selectedFarm) return;
    setLoading(true);
    setQrCode(null);
    try {
      await axios.post('/api/whatsapp/logout', { farmId: selectedFarm.id });
      setStatus('connecting');
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleForceNewQr = async () => {
    if (!selectedFarm) return;
    if (!window.confirm('Generate a new QR code? You will need to scan it again to link WhatsApp.')) return;
    setLoading(true);
    setQrCode(null);
    try {
      await axios.post('/api/whatsapp/logout', { farmId: selectedFarm.id });
      setStatus('connecting');
    } catch (err) {
      setLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (!selectedFarm) return;
    setLoading(true);
    try {
      await axios.post('/api/whatsapp/reconnect', { farmId: selectedFarm.id });
    } catch (err) {
      setLoading(false);
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

  return (
    <div className="connect-whatsapp-page">
      <header className="connect-whatsapp-header">
        <button type="button" className="back-btn" onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h1>Connect WhatsApp</h1>
        <p className="header-subtitle">Scan the QR code with your phone to link WhatsApp for farm alerts</p>
      </header>

      <main className="connect-whatsapp-main">
        {farms.length === 0 ? (
          <div className="connect-whatsapp-empty">
            <Smartphone size={48} />
            <p>No farms found. Add a farm first from the dashboard.</p>
            <button type="button" className="action-btn-nm" onClick={() => navigate('/')}>Go to Dashboard</button>
          </div>
        ) : (
          <>
            <div className="farm-selector-row">
              <span className="farm-label">Farm</span>
              <div className="farm-dropdown-wrap">
                <button
                  type="button"
                  className="farm-dropdown-trigger"
                  onClick={() => setFarmDropdownOpen((o) => !o)}
                >
                  <span>{selectedFarm?.name ?? 'Select farm'}</span>
                  <ChevronDown size={18} className={farmDropdownOpen ? 'open' : ''} />
                </button>
                {farmDropdownOpen && (
                  <div className="farm-dropdown-menu">
                    {farms.map((farm) => (
                      <button
                        key={farm.id}
                        type="button"
                        className={`farm-dropdown-item ${selectedFarm?.id === farm.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedFarm(farm);
                          setFarmDropdownOpen(false);
                        }}
                      >
                        {farm.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="platform-settings-container">
              <div className="settings-card">
                <div className="settings-header">
                  <Smartphone size={32} className="header-icon" />
                  <div className="header-text">
                    <h3>WhatsApp Connection</h3>
                    <p>
                      {status === 'connected'
                        ? 'Your account is linked for this farm.'
                        : 'Scan the QR code with WhatsApp on your phone to link this farm.'}
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
                        <h4>Linked</h4>
                        <p>WhatsApp is connected for {selectedFarm?.name}.</p>
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
                      <button type="button" className="action-btn-nm logout" onClick={handleLogout}>
                        <LogOut size={18} />
                        <span>Disconnect</span>
                      </button>
                      <button type="button" className="action-btn-nm secondary" onClick={handleForceNewQr} disabled={loading}>
                        <QrCode size={18} />
                        <span>New QR</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="action-btn-nm" onClick={handleReconnect} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                        <span>Retry</span>
                      </button>
                      <button type="button" className="action-btn-nm secondary" onClick={handleForceNewQr} disabled={loading}>
                        <QrCode size={18} />
                        <span>New QR</span>
                      </button>
                    </>
                  )}
                </div>

                <div className="settings-footer">
                  <p>Status: {status} • Farm: {selectedFarm?.name ?? '—'}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ConnectWhatsApp;
