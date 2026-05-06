import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, List, FileText, Settings, ShoppingCart, Clapperboard, Users } from 'lucide-react'
import { cn } from "@/lib/utils"
import { UserMenu } from '@/components/UserMenu'
import { DEFAULT_SETTINGS_CHANGED_EVENT, SettingsService } from '@/lib/settingsService'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import { isSupabaseConfigured } from '@/lib/supabase/client'

export function Navigation() {
  const location = useLocation()
  const { authBackend } = useAuth()
  const { activeWorkspaceId, workspaces } = useWorkspace()
  const { activeOrganizationName } = useOrganization()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navContainerRef = useRef<HTMLDivElement | null>(null)
  const [mobileTabletUi, setMobileTabletUi] = useState(
    () => SettingsService.loadDefaultSettings().mobileTabletUi
  )

  useEffect(() => {
    const syncMobileTablet = () => {
      setMobileTabletUi(SettingsService.loadDefaultSettings().mobileTabletUi)
    }
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncMobileTablet)
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, syncMobileTablet)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!mobileMenuOpen) return
      const target = event.target as Node | null
      if (!target) return
      if (navContainerRef.current && !navContainerRef.current.contains(target)) {
        setMobileMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const showDataContextChip =
    isSupabaseConfigured() && authBackend === 'supabase'
  const activeWorkspaceName = activeWorkspaceId
    ? workspaces.find((w) => w.workspaceId === activeWorkspaceId)?.name
    : null

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/inventory", label: "Inventory", icon: List },
    { path: "/checkout", label: "Check-In/Out", icon: ShoppingCart },
    { path: "/productions", label: "Productions", icon: Clapperboard },
    { path: "/crew", label: "Crew", icon: Users },
    { path: "/reports", label: "Reports", icon: FileText },
    { path: "/settings", label: "Settings", icon: Settings }
  ]

  return (
    <nav className="bg-background border-b sticky top-0 z-50">
      <div ref={navContainerRef} className="mx-auto flex w-full max-w-full px-3 sm:px-4 lg:px-6">
        <div className="flex h-16 w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 max-w-[min(100%,220px)] flex-col gap-0.5 sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
            <Link
              to="/"
              className={cn(
                'shrink-0 min-w-0 font-bold hover:text-primary transition-colors',
                mobileTabletUi ? 'text-base sm:text-lg' : 'text-lg'
              )}
            >
              TEd_trackIT
            </Link>
            {showDataContextChip ? (
              <span
                className="truncate rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                title={
                  activeWorkspaceId
                    ? `Organization: ${activeOrganizationName ?? 'Organization'} · Team workspace: ${activeWorkspaceName ?? activeWorkspaceId}`
                    : 'Personal inventory (your user_app_data row)'
                }
              >
                {activeWorkspaceId
                  ? `${activeOrganizationName ?? 'Organization'} · ${activeWorkspaceName ?? 'Workspace'}`
                  : 'Personal'}
              </span>
            ) : null}
          </div>

          <div className="hidden min-w-0 md:flex md:items-center md:space-x-1 lg:space-x-2">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  'flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-sm font-medium transition-colors md:min-h-0 md:min-w-0',
                  mobileTabletUi ? 'px-2 py-1.5 md:max-lg:px-2 md:max-lg:justify-center lg:px-3 lg:py-2' : 'px-3 py-2',
                  location.pathname === item.path
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    mobileTabletUi ? "mr-2 md:max-lg:mr-0 lg:mr-2" : "mr-2"
                  )}
                  aria-hidden
                />
                <span className={cn(mobileTabletUi && "md:max-lg:sr-only")}>{item.label}</span>
              </Link>
            ))}
            <div className="ml-2 md:ml-4 flex items-center">
              <UserMenu />
            </div>
          </div>

          <button
            type="button"
            className="md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden space-y-0.5 pb-2">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  location.pathname === item.path
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            ))}
            <div className="px-3 py-1">
              <UserMenu />
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
