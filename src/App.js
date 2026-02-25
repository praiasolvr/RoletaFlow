import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import Login from '@/pages/Login';
import OperatorDashboard from '@/pages/OperatorDashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import CompanyManagement from '@/pages/CompanyManagement';
import VehicleManagement from '@/pages/VehicleManagement';
import Reports from '@/pages/Reports';
import '@/App.css';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { currentUser, userProfile, loading, loadingProfile } = useAuth();

  if (loading || loadingProfile) {
    return null; // ou spinner
  }

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && userProfile?.role !== 'admin') {
    return <Navigate to="/operator/dashboard" replace />;
  }

  return children;
};

const DashboardRouter = () => {
  const { userProfile, loading, loadingProfile } = useAuth();

  if (loading || loadingProfile) return null; // ou spinner

  if (userProfile?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/operator/dashboard" replace />;
};

function AppRoutes() {
  const { currentUser, loading, loadingProfile } = useAuth();

  if (loading || loadingProfile) return null; // aguarda carregamento global

  return (
    <Routes>
      <Route
        path="/"
        element={currentUser ? <DashboardRouter /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRouter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operator/dashboard"
        element={
          <ProtectedRoute>
            <OperatorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute adminOnly>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/companies"
        element={
          <ProtectedRoute adminOnly>
            <CompanyManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/vehicles"
        element={
          <ProtectedRoute adminOnly>
            <VehicleManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute adminOnly>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operator/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <div className="App dark">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
