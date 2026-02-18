import React, { useState, useEffect } from 'react';
import WhatsAppManager from '../components/WhatsAppManager';
import { ShieldCheck, User, Tractor, Users, Plus, Save } from 'lucide-react';
import axios from 'axios';

const AdminOnboarding = () => {
  const [adminInfo, setAdminInfo] = useState({ name: '', farmName: '' });
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchAdminInfo();
    fetchUsers();
  }, []);

  const fetchAdminInfo = async () => {
    try {
      const { data } = await axios.get('/api/admin/info');
      setAdminInfo(data);
    } catch (error) {
      console.error('Failed to fetch admin info', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get('/api/users');
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  const handleAdminSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/admin/setup', adminInfo);
      setMessage('Admin info saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save admin info', error);
    } finally {
        setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/users', newUser);
      setNewUser({ name: '', phone: '' });
      fetchUsers();
    } catch (error) {
      console.error('Failed to add user', error);
      alert(error.response?.data?.error || 'Failed to add user');
    }
  };

  return (
    <div className="whatsapp-container">
      <header className="main-header">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <ShieldCheck size={48} className="text-green-500" />
        </div>
        <h1>Admin Onboarding</h1>
        <p>Setup the Smart Irrigation System to enable alerts.</p>
      </header>
      
      <div className="card-container">
        {/* Step 1: Admin Details */}
        <div className="card glass-card">
            <div className="card-header">
                <Tractor size={24} />
                <h3>Farm & Admin Details</h3>
            </div>
            <form onSubmit={handleAdminSave}>
                <div className="form-group">
                    <label>Admin Name</label>
                    <input 
                        type="text" 
                        value={adminInfo.name} 
                        onChange={(e) => setAdminInfo({...adminInfo, name: e.target.value})}
                        required 
                        placeholder="John Doe"
                    />
                </div>
                <div className="form-group">
                    <label>Farm Name</label>
                    <input 
                        type="text" 
                        value={adminInfo.farmName} 
                        onChange={(e) => setAdminInfo({...adminInfo, farmName: e.target.value})}
                        required 
                        placeholder="Green Acres"
                    />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Save Details'}
                </button>
                {message && <p className="success-text" style={{marginTop: '10px', color: '#10b981'}}>{message}</p>}
            </form>

            {/* Admin Connection Details */}
            {adminInfo.whatsapp && (
                <div style={{marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px'}}>
                    <h4 style={{marginBottom: '10px', fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase'}}>Connected Device</h4>
                    <table className="data-table">
                        <tbody>
                            <tr>
                                <td style={{width: '40%', color: '#94a3b8'}}>WhatsApp Name</td>
                                <td>{adminInfo.whatsapp.name}</td>
                            </tr>
                            <tr>
                                <td style={{color: '#94a3b8'}}>Phone Number</td>
                                <td>{adminInfo.whatsapp.jid.split('@')[0]}</td>
                            </tr>
                            <tr>
                                <td style={{color: '#94a3b8'}}>Connected Since</td>
                                <td>{new Date(adminInfo.whatsapp.connectedAt).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* Step 2: WhatsApp Connection */}
        <WhatsAppManager />

        {/* Step 3: User Management */}
        <div className="card glass-card">
            <div className="card-header">
                <Users size={24} />
                <h3>Manage Users</h3>
            </div>
            
            {/* Add User Form */}
            <form onSubmit={handleAddUser} className="message-form" style={{marginBottom: '20px'}}>
                <div className="form-group">
                    <label>User Name</label>
                    <input 
                        type="text" 
                        value={newUser.name} 
                        onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                        required 
                        placeholder="Jane Doe"
                    />
                </div>
                <div className="form-group">
                    <label>Phone Number</label>
                    <input 
                        type="text" 
                        value={newUser.phone} 
                        onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                        required 
                        placeholder="919876543210"
                    />
                </div>
                <button type="submit" className="btn btn-primary">
                    <Plus size={18} /> Add User
                </button>
            </form>

            {/* Users Table */}
            <div className="table-container">
                <h4>Registered Users ({users.length})</h4>
                {users.length === 0 ? (
                    <p style={{color: '#94a3b8', fontStyle: 'italic'}}>No users added yet.</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone Number</th>
                                <th>Added On</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.name}</td>
                                    <td>{user.phone}</td>
                                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOnboarding;
