import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Trees as Farm, ChevronDown, Plus, Activity, Trash2 } from 'lucide-react';
import AddFarmModal from './AddFarmModal';
import './FarmSelector.css';

import { io } from 'socket.io-client';

const FarmSelector = ({ selectedFarm, onSelectFarm }) => {
  const [farms, setFarms] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchFarms();

    const socket = io();
    socket.on('farm_updated', (updatedFarm) => {
        setFarms(prevFarms => prevFarms.map(farm => 
            farm.id === updatedFarm.id ? { ...farm, ...updatedFarm } : farm
        ));
        
        // Also update selected farm if it's the one that changed
        if (selectedFarm && selectedFarm.id === updatedFarm.id) {
            onSelectFarm(prev => ({ ...prev, ...updatedFarm }));
        }
    });
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        socket.disconnect();
    };
  }, [selectedFarm]);

  const fetchFarms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/farms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFarms(response.data);
      if (response.data.length > 0 && !selectedFarm) {
        onSelectFarm(response.data[0]);
      } else if (response.data.length === 0) {
        onSelectFarm(null);
      } else if (selectedFarm && !response.data.find(f => f.id === selectedFarm.id)) {
        onSelectFarm(response.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch farms:', err);
    }
  };

  const handleSelect = (farm) => {
    onSelectFarm(farm);
    setIsOpen(false);
  };

  const handleDeleteFarm = async (e) => {
    e.stopPropagation(); // Prevent dropdown from closing or toggling
    
    if (!selectedFarm) return;
    
    const confirmed = window.confirm(`Are you sure you want to delete "${selectedFarm.name}"? This will remove all associated data and devices.`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/farms/${selectedFarm.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh farms list
      await fetchFarms();
    } catch (err) {
      console.error('Failed to delete farm:', err);
      alert('Failed to delete farm. Please try again.');
    }
  };

  return (
    <div className="farm-selector-wrapper">
      <div className="farm-selector-container" ref={dropdownRef}>
        <div 
          className={`farm-selector-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="farm-selector-info">
            <Farm size={18} className="farm-icon-main" />
            <span className="farm-name-display">
              {selectedFarm ? selectedFarm.name : 'Select Farm'}
            </span>
          </div>
          <ChevronDown size={16} className={`chevron ${isOpen ? 'up' : ''}`} />
        </div>

        {isOpen && (
          <div className="farm-selector-dropdown">
            <div className="dropdown-content">
              {farms.length === 0 ? (
                <div className="dropdown-placeholder">No farms found</div>
              ) : (
                farms.map((farm) => (
                  <div 
                    key={farm.id} 
                    className={`dropdown-item ${selectedFarm?.id === farm.id ? 'selected' : ''}`}
                    onClick={() => handleSelect(farm)}
                  >
                    <Activity size={14} className={farm.connection_status === 'connected' ? 'status-online' : 'status-offline'} />
                    <span>{farm.name}</span>
                  </div>
                ))
              )}
              <div className="dropdown-divider"></div>
              <button 
                className="dropdown-add-btn"
                onClick={() => {
                  setIsModalOpen(true);
                  setIsOpen(false);
                }}
              >
                <Plus size={16} />
                <span>Add Farm</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedFarm && (
        <button 
          className="farm-delete-btn" 
          onClick={handleDeleteFarm}
          title="Delete current farm"
        >
          <Trash2 size={18} />
        </button>
      )}

      <AddFarmModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onFarmAdded={fetchFarms} 
      />
    </div>
  );
};

export default FarmSelector;
