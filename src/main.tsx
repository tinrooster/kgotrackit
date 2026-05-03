import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, createRoutesFromElements, Route } from 'react-router-dom'
import App from './App'
import './index.css'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { LoginPage } from './components/LoginPage'
import { SupabaseSyncBridge } from './components/SupabaseSyncBridge'

// Initialize the application data
// Removed dummy data initialization

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<App />} />
    </>
  )
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <SupabaseSyncBridge>
        <RouterProvider router={router} />
      </SupabaseSyncBridge>
      <Toaster 
        position="bottom-right"
        richColors
        expand
        closeButton
        duration={4000}
        theme="system"
        style={{ zIndex: 9999 }}
        toastOptions={{
          className:
            "backdrop-blur-md bg-background/65 border-border/60 text-foreground shadow-lg",
        }}
      />
    </AuthProvider>
  </React.StrictMode>,
)