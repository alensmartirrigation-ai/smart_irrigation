import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AdminOnboarding from './pages/AdminOnboarding';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/onboarding" element={<AdminOnboarding />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
