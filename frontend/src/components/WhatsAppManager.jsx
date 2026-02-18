import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { CheckCircle, XCircle, Loader2, Send, LogOut, MessageSquare } from 'lucide-react';

const WhatsAppManager = () => {
  const [status, setStatus] = useState('connecting'); // connecting, scanning, connected, disconnected
  const [qr, setQr] = useState(null);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageStatus, setMessageStatus] = useState({ type: '', text: '' });

  useEffect(() => {
    const socket = io();

    socket.on('whatsapp_status', (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'connected') setQr(null);
    });

    socket.on('whatsapp_qr', (qrCode) => {
      setQr(qrCode);
      if (qrCode) setStatus('scanning');
    });

    return () => socket.disconnect();
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessageStatus({ type: '', text: '' });

    try {
      const response = await axios.post('/api/whatsapp/send', { to, message });
      setMessageStatus({ type: 'success', text: 'Message sent successfully!' });
      setTo('');
      setMessage('');
    } catch (error) {
      setMessageStatus({
        type: 'error',
        text: error.response?.data?.error || 'Failed to send message',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await axios.post('/api/whatsapp/logout');
        window.location.reload();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  const renderStatus = () => {
    const statusMap = {
      scanning: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', text: 'Scanning Required' },
      connected: { color: 'text-green-500', bg: 'bg-green-500/10', text: 'Connected' },
      disconnected: { color: 'text-red-500', bg: 'bg-red-500/10', text: 'Disconnected' },
      connecting: { color: 'text-blue-500', bg: 'bg-blue-500/10', text: 'Connecting...' },
    };

    const current = statusMap[status] || statusMap.connecting;

    return (
      <div className={`status-badge ${status}`}>
        <span className="dot"></span>
        <span>{current.text}</span>
      </div>
    );
  };

  return (
    <div className="whatsapp-manager">

      <div className="card-container">
        <div className="card glass-card main-card">
          {renderStatus()}

          {status === 'connected' ? (
            <div className="connected-info">
              <div className="success-icon-container">
                <CheckCircle size={64} className="success-icon" />
              </div>
              <h3>Account Linked</h3>
              <p>Your WhatsApp is ready to receive alerts.</p>
              <button onClick={handleLogout} className="btn btn-danger">
                <LogOut size={18} /> Logout Account
              </button>
            </div>
          ) : (
            <div className="qr-section">
              <div className="qr-wrapper">
                {qr ? (
                  <img src={qr} alt="WhatsApp QR Code" className="qr-code" />
                ) : (
                  <div className="qr-loading">
                    <Loader2 size={40} className="animate-spin" />
                    <p>Fetching QR Code...</p>
                  </div>
                )}
              </div>
              <p className="qr-hint">Scan this code using your WhatsApp app</p>
            </div>
          )}
        </div>

        {status === 'connected' && (
          <div className="card glass-card test-message-card">
            <div className="card-header">
              <MessageSquare size={20} />
              <h3>Test Messaging</h3>
            </div>
            <form onSubmit={handleSendMessage} className="message-form">
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g., 919876543210"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea
                  placeholder="Hello from Smart Irrigation!"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
            {messageStatus.text && (
              <div className={`message-status-box ${messageStatus.type}`}>
                {messageStatus.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {messageStatus.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppManager;
