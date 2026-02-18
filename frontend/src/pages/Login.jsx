import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo.png';
import './Login.css';

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
