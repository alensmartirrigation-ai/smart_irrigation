import React, { useState } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { Trees as Farm, Loader } from 'lucide-react';

const AddFarmModal = ({ isOpen, onClose, onFarmAdded }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/farms', { name }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onFarmAdded();
      onClose();
      setName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add farm');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Farm">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="input-field-nm">
          <Farm size={18} />
          <input
            type="text"
            placeholder="Farm Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="submit-btn-nm" disabled={loading}>
          {loading ? <Loader className="spinning" size={20} /> : 'Create Farm'}
        </button>
      </form>
    </Modal>
  );
};

export default AddFarmModal;
