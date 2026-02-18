import React from 'react';
import './DashboardHeader.css';

const DashboardHeader = ({ title, subtitle, children }) => {
  return (
    <div className="dashboard-welcome-header">
      <div className="header-top-row">
        <h1>{title}</h1>
        <div className="header-actions">
          {children}
        </div>
      </div>
      <p>{subtitle}</p>
    </div>
  );
};

export default DashboardHeader;
