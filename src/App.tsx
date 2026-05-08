import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import { AppBreadcrumbs } from './components/AppBreadcrumbs';
import { SettingsService } from './lib/settingsService';
import { refreshRackLocationsFromServer } from './lib/rackLocationsConfig';
import HelpPage from './pages/HelpPage';
import AboutPage from './pages/AboutPage';
import ProductionsPage from './pages/ProductionsPage';
import TimePickerLabPage from './pages/TimePickerLabPage';
import UiDiagnosticsPage from './pages/UiDiagnosticsPage';
import DevMenuPage from './pages/DevMenuPage';

const LAST_ROUTE_STORAGE_KEY = 'trackit:last-route';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Restoring session...
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const inventoryFullBleed = location.pathname === '/inventory';
  const { loading: authLoading } = useAuth();
  const [showInitialDefaultsDialog, setShowInitialDefaultsDialog] = useState(false);
  const [restoreChecked, setRestoreChecked] = useState(false);

  useEffect(() => {
    // Persist the most recent in-app route so refresh/login can restore the exact subpage.
    if (location.pathname === '/login') return;
    try {
      const fullPath = `${location.pathname}${location.search}${location.hash}`;
      sessionStorage.setItem(LAST_ROUTE_STORAGE_KEY, fullPath);
    } catch {
      /* ignore */
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (restoreChecked || authLoading) return;
    setRestoreChecked(true);
    if (location.pathname !== '/' || location.search || location.hash) {
      return;
    }
    try {
      const storedPath = sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
      if (!storedPath || storedPath === '/' || storedPath === '/login') {
        return;
      }
      navigate(storedPath, { replace: true });
    } catch {
      /* ignore */
    }
  }, [authLoading, location.hash, location.pathname, location.search, navigate, restoreChecked]);

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

  useEffect(() => {
    const clearOrphanedModalLock = () => {
      const hasOpenDialog = Boolean(
        document.querySelector(
          '[role="dialog"][data-state="open"], [data-radix-dialog-content][data-state="open"], [data-radix-alert-dialog-content][data-state="open"]',
        ),
      );
      if (hasOpenDialog) return;

      // Radix can occasionally leave body lock styles behind after abrupt route changes.
      document.body.style.removeProperty('pointer-events');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');

      const staleOverlays = document.querySelectorAll('[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]');
      staleOverlays.forEach((overlayNode) => {
        const element = overlayNode as HTMLElement;
        if (element.getAttribute('data-state') !== 'open') {
          element.remove();
        }
      });
    };

    clearOrphanedModalLock();
    window.setTimeout(clearOrphanedModalLock, 0);
  }, [location.pathname]);

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
          <AppBreadcrumbs />
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
                path="/productions"
                element={
                  <ProtectedRoute>
                    <ProductionsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/crew" element={<Navigate to="/settings?st=masterCrew" replace />} />
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
              <Route
                path="/dev"
                element={
                  <ProtectedRoute>
                    <DevMenuPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dev/time-picker-lab"
                element={
                  <ProtectedRoute>
                    <TimePickerLabPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dev/ui-diagnostics"
                element={
                  <ProtectedRoute>
                    <UiDiagnosticsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/time-picker-lab" element={<Navigate to="/dev/time-picker-lab" replace />} />
              <Route path="/ui-diagnostics" element={<Navigate to="/dev/ui-diagnostics" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Toaster />
        </div>
      </ErrorBoundary>
    </>
  );
}