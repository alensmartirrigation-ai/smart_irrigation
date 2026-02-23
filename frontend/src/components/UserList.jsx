import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Phone, Shield, Search, RefreshCw, Plus, Trash2, MapPin } from 'lucide-react';
import AddUserModal from './AddUserModal';
import './UserList.css';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'admin');
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone?.includes(searchTerm)
  );

  return (
    <div className="user-list-container">
      <div className="user-list-controls">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="action-buttons">
          <button className="refresh-btn" onClick={fetchUsers} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
          {isAdmin && (
            <button className="add-btn-nm" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="user-list-state">
          <div className="spinner"></div>
          <p>Loading users...</p>
        </div>
      ) : error ? (
        <div className="user-list-state error">
          <p>{error}</p>
          <button onClick={fetchUsers}>Retry</button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="user-list-state">
          <p>No users found.</p>
        </div>
      ) : (
        <div className="user-grid">
          {filteredUsers.map(user => (
            <div key={user.id} className="user-card">
              <div className="user-card-header">
                <div className="user-avatar">
                  <User size={24} />
                </div>
                <div className="user-role-badge">
                  <Shield size={12} />
                  <span>{user.role}</span>
                </div>
              </div>
              <div className="user-card-body">
                <h3>{user.name}</h3>
                <p className="username">@{user.username}</p>
                <div className="user-info-row">
                  <Phone size={14} />
                  <span>{user.phone}</span>
                </div>
                
                <div className="user-farms-section">
                  <div className="section-header">
                    <MapPin size={14} />
                    <span>Farm</span>
                  </div>
                  <div className="farm-tags">
                    {user.Farm ? (
                      <div className="farm-tag">
                        <span>{user.Farm.name}</span>
                      </div>
                    ) : (
                      <p className="no-farms">No farm assigned</p>
                    )}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button className="delete-btn-nm" onClick={() => handleDelete(user.id)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddUserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onUserAdded={fetchUsers} 
      />
    </div>
  );
};

export default UserList;
