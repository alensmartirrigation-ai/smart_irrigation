import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import WhatsAppManager from '../components/WhatsAppManager';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </button>
        <h1>Settings & Integrations</h1>
      </header>

      <main className="settings-container">
        <section className="settings-section">
          <div className="section-header">
            <MessageCircle size={28} className="section-icon" />
            <h2>Messaging Platforms</h2>
          </div>
          <p className="section-description">
            Connect your messaging accounts to receive real-time alerts and interact with the irrigation system.
          </p>

          <div className="integration-card neumorphic-card">
            <div className="integration-info">
              <h3>WhatsApp Integration</h3>
              <p>Currently our primary messaging channel for farm alerts.</p>
            </div>
            <div className="integration-content">
              <WhatsAppManager />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Settings;
