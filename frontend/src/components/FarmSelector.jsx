import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Trees as Farm, ChevronDown, Plus, Activity } from 'lucide-react';
import AddFarmModal from './AddFarmModal';
import './FarmSelector.css';

const FarmSelector = () => {
  const [farms, setFarms] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchFarms();
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchFarms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/farms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFarms(response.data);
      if (response.data.length > 0 && !selectedFarm) {
        setSelectedFarm(response.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch farms:', err);
    }
  };

  const handleSelect = (farm) => {
    setSelectedFarm(farm);
    setIsOpen(false);
    // You might want to update a global state or emit an event here
  };

  return (
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

      <AddFarmModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onFarmAdded={fetchFarms} 
      />
    </div>
  );
};

export default FarmSelector;
