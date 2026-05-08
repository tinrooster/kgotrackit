import React from 'react';
import { LoginForm } from '@/components/LoginForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const LAST_ROUTE_STORAGE_KEY = 'trackit:last-route';

export function LoginPage() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // If already authenticated, redirect to dashboard
  if (currentUser && !loading) {
    const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const from = state?.from;
    const fromPath =
      from?.pathname
        ? `${from.pathname ?? ''}${from.search ?? ''}${from.hash ?? ''}`
        : null;
    let storedPath: string | null = null;
    try {
      storedPath = sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    } catch {
      storedPath = null;
    }
    const destination = fromPath || storedPath || '/';
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <div className="w-full max-w-md p-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">TEd_trackIT</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your inventory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}