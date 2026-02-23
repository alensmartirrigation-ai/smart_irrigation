import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter, ReferenceArea } from 'recharts';
import Modal from './Modal';
import { Loader, Zap } from 'lucide-react';

const DeviceGraphModal = ({ isOpen, onClose, device }) => {
  const [data, setData] = useState([]);
  const [irrigationEvents, setIrrigationEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [duration, setDuration] = useState('1h');
  const [visibleMetrics, setVisibleMetrics] = useState({
    temperature: true,
    humidity: true,
    moisture: true,
    irrigation: true
  });

  const handleWheel = (e) => {
    if (data.length < 10) return;
    
    // deltaY < 0 means scroll up (zoom in)
    const factor = 0.1;
    if (e.deltaY < 0) {
      setZoomLevel(prev => Math.max(0.1, prev - factor));
    } else {
      setZoomLevel(prev => Math.min(1, prev + factor));
    }
  };

  const toggleMetric = (metric) => {
    setVisibleMetrics(prev => ({ ...prev, [metric]: !prev[metric] }));
  };

  const displayedData = data.slice(-Math.floor(data.length * zoomLevel));

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
    // Only set loading on initial fetch or duration change, not every poll if data exists
    if (data.length === 0) setLoading(true); 
    
    setError(null);
    try {
      const token = localStorage.getItem('token');
      
      const [readingsRes, eventsRes] = await Promise.all([
        axios.get(`/api/devices/${device.id}/readings?duration=${duration}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`/api/devices/${device.id}/irrigation-events?duration=${duration}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      const formattedData = readingsRes.data.data.map(item => ({
        ...item,
        timeDisplay: new Date(item.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
        // Keep the raw timestamp so we can use it to map ReferenceAreas
        rawTimeMs: new Date(item.time).getTime()
      }));
      
      setData(formattedData);
      setIrrigationEvents(eventsRes.data.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      if (data.length === 0) setError('Failed to load device data.');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const pointData = payload[0].payload;
      return (
        <div className="custom-tooltip" style={{ 
          backgroundColor: 'var(--nm-bg)', 
          padding: '12px', 
          border: '1px solid var(--nm-shadow)',
          borderRadius: '12px',
          boxShadow: '6px 6px 12px var(--nm-shadow), -4px -4px 8px var(--nm-light)'
        }}>
          <p className="label" style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid var(--nm-shadow)', paddingBottom: '4px' }}>{label}</p>
          {payload.map((entry, index) => {
            if (entry.dataKey === 'irrigationY') return null;
            return (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', margin: '4px 0' }}>
                <span style={{ color: entry.color, fontSize: '12px', fontWeight: '500' }}>{entry.name}:</span>
                <span style={{ fontSize: '12px', color: 'var(--nm-text)', fontWeight: 'bold' }}>
                  {entry.value}
                  {entry.name === 'Temperature' ? '°C' : entry.name === 'Duration' ? 's' : '%'}
                </span>
              </div>
            );
          })}
          {pointData.is_irrigating === 1 && (
            <div style={{ marginTop: '8px', paddingTop: '4px', borderTop: '1px solid var(--nm-shadow)', display: 'flex', alignItems: 'center', color: '#32d74b', fontSize: '12px', fontWeight: 'bold' }}>
              <Zap size={14} style={{ marginRight: '5px' }} /> Irrigating
            </div>
          )}
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
              onClick={() => { setDuration(d); setData([]); setZoomLevel(1); }} 
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

        <div className="metric-toggles">
          {[
            { key: 'temperature', label: 'Temp', color: '#ff7300' },
            { key: 'humidity', label: 'Humidity', color: '#387908' },
            { key: 'moisture', label: 'Moisture', color: '#8884d8' },
            { key: 'irrigation', label: 'Irrigation', color: '#00d2ff' }
          ].map(m => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              style={{
                marginRight: '10px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: `1px solid ${visibleMetrics[m.key] ? m.color : 'transparent'}`,
                background: visibleMetrics[m.key] ? 'var(--nm-bg)' : 'var(--nm-bg)',
                color: visibleMetrics[m.key] ? m.color : 'var(--nm-text-light)',
                boxShadow: visibleMetrics[m.key] ? 'inset 2px 2px 4px var(--nm-shadow), inset -2px -2px 4px var(--nm-light)' : '3px 3px 6px var(--nm-shadow), -3px -3px 6px var(--nm-light)',
                cursor: 'pointer',
                opacity: visibleMetrics[m.key] ? 1 : 0.7
              }}
            >
              {m.label}
            </button>
          ))}
          {zoomLevel < 1 && (
            <button 
              onClick={() => setZoomLevel(1)}
              style={{
                marginLeft: '10px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--nm-bg)',
                color: 'var(--nm-accent)',
                boxShadow: '3px 3px 6px var(--nm-shadow), -3px -3px 6px var(--nm-light)',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Reset Zoom
            </button>
          )}
        </div>
      </div>

      <div 
        style={{ width: '100%', height: 600, cursor: 'ns-resize' }} 
        onWheel={handleWheel}
        title="Scroll to zoom"
      >
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
            <ComposedChart data={displayedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--nm-text-light)" opacity={0.2} />
              <XAxis dataKey="timeDisplay" stroke="var(--nm-text-light)" tick={{fontSize: 12}} />
              <XAxis xAxisId="rawTime" dataKey="rawTimeMs" hide type="number" domain={['dataMin', 'dataMax']} />
              <YAxis yAxisId="left" stroke="var(--nm-text-light)" tick={{fontSize: 12}} label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', style: { fill: 'var(--nm-text)' } }} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--nm-text-light)" tick={{fontSize: 12}} label={{ value: 'Humidity / Moisture (%)', angle: 90, position: 'insideRight', style: { fill: 'var(--nm-text)' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {/* Irrigation background shaded zones */}
              {visibleMetrics.irrigation && irrigationEvents.map((event, idx) => {
                // Determine if this shaded area is within our current zoomed time region
                const visibleStart = displayedData[0]?.rawTimeMs;
                const visibleEnd = displayedData[displayedData.length - 1]?.rawTimeMs;
                
                if (event.end_time < visibleStart || event.start_time > visibleEnd) return null;

                return (
                  <ReferenceArea
                    key={`irr-${idx}`}
                    xAxisId="rawTime"
                    yAxisId="right"
                    x1={event.start_time}
                    x2={event.end_time}
                    fill="#32d74b"
                    fillOpacity={0.15}
                    strokeOpacity={0.5}
                    stroke="#32d74b"
                  />
                )
              })}

              {visibleMetrics.moisture && <Bar yAxisId="right" dataKey="moisture" name="Moisture" fill="#8884d8" barSize={20} opacity={0.6} isAnimationActive={false} />}
              {visibleMetrics.irrigation && <Bar yAxisId="right" dataKey="irrigation_duration" name="Duration" fill="#00d2ff" barSize={10} opacity={0.4} isAnimationActive={false} />}
              {visibleMetrics.temperature && <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temperature" stroke="#ff7300" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
              {visibleMetrics.humidity && <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity" stroke="#387908" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Modal>
  );
};

export default DeviceGraphModal;
