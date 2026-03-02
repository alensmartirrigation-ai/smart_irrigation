import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AdminOnboarding from './pages/AdminOnboarding';
import Login from './pages/Login';
import Settings from './pages/Settings';
import ConnectWhatsApp from './pages/ConnectWhatsApp';
import { ProtectedRoute } from './utils/auth';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />
          <Route path="/connect-whatsapp" element={
            <ProtectedRoute>
              <ConnectWhatsApp />
            </ProtectedRoute>
          } />
          <Route path="/admin/onboarding" element={
            <ProtectedRoute>
              <AdminOnboarding />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
