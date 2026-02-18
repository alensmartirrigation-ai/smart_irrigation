import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo.png'; // adjust path if needed

const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('/api/auth/login', formData);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@500&display=swap');

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body, #root, .App {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          max-width: none;
        }

        body {
          font-family: 'Inter', sans-serif;
        }

        .isp-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #3312ebff 0%, #a59999ff 100%);
          position: relative;
          overflow: hidden;
        }

        .isp-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          position: relative;
          z-index: 1;
        }

        .isp-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          opacity: 0.7;
        }

        .isp-blob-1 {
          width: 40vw;
          height: 40vw;
          max-width: 500px;
          max-height: 500px;
          background: rgba(108, 99, 255, 0.15);
          top: -10%;
          left: -10%;
        }

        .isp-blob-2 {
          width: 35vw;
          height: 35vw;
          max-width: 420px;
          max-height: 420px;
          background: rgba(77, 155, 255, 0.15);
          bottom: -10%;
          right: -10%;
        }

        .isp-container {
          width: 100%;
          max-width: 1100px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        @media (min-width: 1024px) {
          .isp-container {
            flex-direction: row;
            align-items: stretch;
          }

          .isp-brand-card,
          .isp-card {
            flex: 1;
          }

          .isp-brand-card,
          .isp-card {
            padding: 56px;
            border-radius: 24px;
          }
        }

        .isp-brand-card {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 40px 28px;
          color: #fff;
          box-shadow: 0 20px 60px rgba(108, 99, 255, 0.25);

          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .isp-logo {
          width: 150px;
          height: 150px;
          object-fit: contain;
          margin-bottom: 1px;
          background: transparent;
        }

        @media (min-width: 1024px) {
          .isp-logo {
            width: 226px;
            height: 226px;
          }
        }

        .isp-brand-name {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .isp-brand-tagline {
          font-size: 15px;
          opacity: 0.85;
        }

        .isp-badge {
          margin-top: 20px;
          display: inline-block;
          background: rgba(255,255,255,0.2);
          padding: 6px 14px;
          border-radius: 999px;
          font-family: 'Roboto Mono', monospace;
          font-size: 12px;
        }

        .isp-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 15px 60px rgba(0,0,0,0.06);
        }

        .isp-card-title {
          font-size: clamp(22px, 2vw, 30px);
          font-weight: 700;
          margin-bottom: 8px;
          color: #1F2937;
        }

        .isp-card-sub {
          font-size: 15px;
          color: #6B7280;
          margin-bottom: 30px;
        }

        .isp-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .isp-label {
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .isp-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1.5px solid transparent;
          background: #F0F2F7;
          font-size: 16px;
          outline: none;
          transition: 0.25s ease;
        }

        .isp-input:focus {
          background: #fff;
          border-color: #5B6CFF;
          box-shadow: 0 0 0 4px rgba(91,108,255,0.1);
        }

        .isp-error {
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.3);
          padding: 12px;
          border-radius: 14px;
          font-size: 14px;
          color: #F87171;
        }

        .isp-submit {
          height: 52px;
          border-radius: 999px;
          border: none;
          font-weight: 600;
          font-size: 16px;
          color: #fff;
          background: linear-gradient(135deg, #6C63FF 0%, #4D9BFF 100%);
          cursor: pointer;
          transition: 0.2s ease;
          box-shadow: 0 10px 30px rgba(108,99,255,0.35);
        }

        .isp-submit:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .isp-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .isp-footer {
          text-align: center;
          padding: 20px;
          font-size: 14px;
          color: #6B7280;
        }
      `}</style>

      <div className="isp-page">
        <div className="isp-blob isp-blob-1" />
        <div className="isp-blob isp-blob-2" />

        <div className="isp-main">
          <div className="isp-container">
            <div className="isp-brand-card">
              <img src={logo} alt="Smart Irrigation System Logo" className="isp-logo" />
              <div className="isp-brand-name">Smart Irrigation System</div>
              <div className="isp-brand-tagline">
                Precision Control for Modern Agriculture
              </div>
              <div className="isp-badge">v1.0</div>
            </div>

            <div className="isp-card">
              <h2 className="isp-card-title">Welcome back</h2>
              <p className="isp-card-sub">
                Sign in to access your dashboard
              </p>

              {error && <div className="isp-error">{error}</div>}

              <form className="isp-form" onSubmit={handleSubmit}>
                <div>
                  <label className="isp-label">Username</label>
                  <input
                    className="isp-input"
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label className="isp-label">Password</label>
                  <input
                    className="isp-input"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button type="submit" className="isp-submit" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="isp-footer">
          No account? Contact Administrator
        </div>
      </div>
    </>
  );
};

export default Login;
