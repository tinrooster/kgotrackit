import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Navigation } from './components/Navigation';
import InventoryPage from './pages/InventoryPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import { Toaster } from './components/ui/toaster';
import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { InitialDefaultsDialog } from './components/setup/InitialDefaultsDialog';
import { applySetupDefaultsChoice, getSetupDefaultsChoice, isFreshSetupState, recordSetupChoiceForWorkspace } from './lib/dummyData';
import { getActiveWorkspaceId } from './lib/supabase/workspaceData';
import { CLOUD_HYDRATED_EVENT } from './lib/cloudSyncEvents';
import CheckoutPage from './pages/CheckoutPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsService } from './lib/settingsService';
import { refreshRackLocationsFromServer } from './lib/rackLocationsConfig';
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
  const location = useLocation();
  const inventoryFullBleed = location.pathname === '/inventory';
  const { loading: authLoading } = useAuth();
  const [showInitialDefaultsDialog, setShowInitialDefaultsDialog] = useState(false);

  useEffect(() => {
    void refreshRackLocationsFromServer();
    const uiSettings = SettingsService.loadDefaultSettings();
    const shouldUseDarkTheme = uiSettings.theme === 'dark'
      || (uiSettings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', shouldUseDarkTheme);
    document.body.classList.toggle('compact-ui', uiSettings.condensedView);
    document.body.classList.toggle('mt-compact-ui', uiSettings.mobileTabletUi);
  }, []);

  useEffect(() => {
    const evaluateSetupDialog = () => {
      if (authLoading) return;
      // Team workspaces are set up via CreateWorkspaceDialog — never prompt here.
      if (getActiveWorkspaceId()) {
        setShowInitialDefaultsDialog(false);
        return;
      }
      const hasRecordedChoice = getSetupDefaultsChoice() !== null;
      const shouldShow = !hasRecordedChoice && isFreshSetupState();
      setShowInitialDefaultsDialog(shouldShow);
    };
    evaluateSetupDialog();
    window.addEventListener(CLOUD_HYDRATED_EVENT, evaluateSetupDialog);
    return () => window.removeEventListener(CLOUD_HYDRATED_EVENT, evaluateSetupDialog);
  }, [authLoading]);

  const handleApplySetupDefaults = (choice: 'blank' | 'starter', includeSampleInventory: boolean) => {
    applySetupDefaultsChoice(choice, includeSampleInventory);
    setShowInitialDefaultsDialog(false);
    window.location.reload();
  };

  const handleDismissSetupDialog = () => {
    // Record 'blank' so the dialog doesn't reappear after dismissal.
    const activeWsId = getActiveWorkspaceId();
    if (activeWsId) {
      recordSetupChoiceForWorkspace(activeWsId, 'blank');
    } else {
      applySetupDefaultsChoice('blank', false);
    }
    setShowInitialDefaultsDialog(false);
  };

  return (
    <>
      <ErrorBoundary>
        <div className="min-h-screen bg-background">
          <InitialDefaultsDialog
            open={showInitialDefaultsDialog}
            onApply={handleApplySetupDefaults}
            onDismiss={handleDismissSetupDialog}
          />
          <Navigation />
          <main
            className={cn(
              'min-w-0 py-6',
              inventoryFullBleed
                ? 'box-border w-full max-w-full px-3 sm:px-4 lg:px-6'
                : 'mx-auto box-border w-full max-w-[min(100%,1200px)] px-4 sm:px-6 xl:max-w-[1400px]'
            )}
          >
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