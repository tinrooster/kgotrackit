import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import InventoryPage from './pages/InventoryPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import { Toaster } from './components/ui/toaster';
import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { initializeSettings } from './lib/dummyData';
import CheckoutPage from './pages/CheckoutPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsService } from './lib/settingsService';
import HelpPage from './pages/HelpPage';
import AboutPage from './pages/AboutPage';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    initializeSettings();
    const uiSettings = SettingsService.loadDefaultSettings();
    const shouldUseDarkTheme = uiSettings.theme === 'dark'
      || (uiSettings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', shouldUseDarkTheme);
    document.body.classList.toggle('compact-ui', uiSettings.condensedView);
  }, []);

  return (
    <>
      <ErrorBoundary>
        <div className="min-h-screen bg-background">
          <Navigation />
          <main className="container mx-auto py-6 px-4">
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/checkout"
                element={
                  <ProtectedRoute>
                    <CheckoutPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/help"
                element={
                  <ProtectedRoute>
                    <HelpPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/about"
                element={
                  <ProtectedRoute>
                    <AboutPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Toaster />
        </div>
      </ErrorBoundary>
    </>
  );
}