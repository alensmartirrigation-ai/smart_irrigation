import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, CheckCircle } from 'lucide-react';
import WhatsAppManager from '../components/WhatsAppManager';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('whatsapp');

  const platforms = [
    { 
      id: 'whatsapp', 
      name: 'WhatsApp', 
      icon: <MessageCircle size={24} />, 
      description: 'Primary channel for farm alerts',
      status: 'Available'
    },
    { 
      id: 'telegram', 
      name: 'Telegram', 
      icon: <MessageCircle size={24} />, 
      description: 'Coming soon...',
      status: 'Coming Soon',
      disabled: true
    }
  ];

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </button>
        <h1>Branding & Integrations</h1>
      </header>

      <main className="settings-split-container">
        {/* Left Side: List of Platforms */}
        <div className="platform-list-panel neumorphic-panel">
          <div className="panel-header">
            <h3>Messaging Platforms</h3>
          </div>
          <div className="platform-list">
            {platforms.map((platform) => (
              <div 
                key={platform.id}
                className={`platform-item ${selectedPlatform === platform.id ? 'active' : ''} ${platform.disabled ? 'disabled' : ''}`}
                onClick={() => !platform.disabled && setSelectedPlatform(platform.id)}
              >
                <div className="platform-icon-wrapper">
                  {platform.icon}
                </div>
                <div className="platform-info">
                  <div className="platform-name-row">
                    <h4>{platform.name}</h4>
                    {platform.id === 'whatsapp' && <span className="status-tag">Primary</span>}
                  </div>
                  <p>{platform.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Detail Pane */}
        <div className="platform-detail-panel neumorphic-panel">
          {selectedPlatform === 'whatsapp' ? (
            <div className="detail-content">
              <div className="detail-header">
                <div className="header-title">
                  <MessageCircle size={32} color="var(--nm-accent)" />
                  <div>
                    <h2>WhatsApp Configuration</h2>
                    <p>Scan the QR code to connect your business account.</p>
                  </div>
                </div>
              </div>
              
              <div className="manager-wrapper">
                <WhatsAppManager />
              </div>
            </div>
          ) : (
            <div className="empty-detail">
              <MessageCircle size={64} color="var(--nm-shadow)" />
              <p>Select a platform to configure integration</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Settings;
