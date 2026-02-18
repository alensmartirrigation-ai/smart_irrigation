import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Modal from './Modal';
import { Loader, RefreshCw } from 'lucide-react';

const DeviceGraphModal = ({ isOpen, onClose, device }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState('1h');

  useEffect(() => {
    let intervalId;
    if (isOpen && device) {
      fetchReadings(); // Initial fetch
      intervalId = setInterval(fetchReadings, 5000); // Poll every 5 seconds
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, device, duration]);

  const fetchReadings = async () => {
    setLoading(true);
    // Only set loading on initial fetch or duration change, not every poll if data exists
    if (data.length === 0) setLoading(true); 
    
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/devices/${device.id}/readings?duration=${duration}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const formattedData = response.data.data.map(item => ({
        ...item,
        timeDisplay: new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      
      setData(formattedData);
    } catch (err) {
      console.error('Error fetching readings:', err);
      // Don't clear data on error if polling, just maybe log or quiet fail
      if (data.length === 0) setError('Failed to load device data.');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip" style={{ 
          backgroundColor: 'var(--nm-bg)', 
          padding: '10px', 
          border: '1px solid var(--nm-shadow)',
          borderRadius: '8px',
          boxShadow: '4px 4px 8px var(--nm-shadow)'
        }}>
          <p className="label" style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color, margin: '2px 0', fontSize: '12px' }}>
              {entry.name}: {entry.value}
              {entry.name === 'Temperature' ? '°C' : '%'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={device ? `${device.device_name} Data` : 'Device Data'}>
      <div className="graph-controls" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="duration-selector">
          {['1h', '6h', '24h', '7d'].map((d) => (
            <button
              key={d}
              onClick={() => { setDuration(d); setData([]); }} 
              style={{
                marginRight: '10px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: duration === d ? 'var(--nm-accent)' : 'var(--nm-bg)',
                color: duration === d ? '#fff' : 'var(--nm-text)',
                boxShadow: duration === d ? 'inset 2px 2px 4px rgba(0,0,0,0.2)' : '3px 3px 6px var(--nm-shadow), -3px -3px 6px var(--nm-light)',
                cursor: 'pointer'
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={fetchReadings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nm-accent)' }}>
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div style={{ width: '100%', height: 600 }}>
        {loading && data.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader className="spinning" size={32} />
          </div>
        ) : error ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'red' }}>
            {error}
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            No data available for this period.
          </div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nm-text-light)" opacity={0.2} />
              <XAxis dataKey="timeDisplay" stroke="var(--nm-text-light)" tick={{fontSize: 12}} />
              <YAxis yAxisId="left" stroke="var(--nm-text-light)" tick={{fontSize: 12}} label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', style: { fill: 'var(--nm-text)' } }} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--nm-text-light)" tick={{fontSize: 12}} label={{ value: 'Humidity / Moisture (%)', angle: 90, position: 'insideRight', style: { fill: 'var(--nm-text)' } }} />
              <YAxis yAxisId="barAxis" hide domain={[0, 170]} /> {/* Hidden axis to squash bars */}
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar yAxisId="barAxis" dataKey="moisture" name="Moisture" fill="#8884d8" barSize={20} opacity={0.6} isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temperature" stroke="#ff7300" dot={false} strokeWidth={3} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity" stroke="#387908" dot={false} strokeWidth={4} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Modal>
  );
};

export default DeviceGraphModal;
