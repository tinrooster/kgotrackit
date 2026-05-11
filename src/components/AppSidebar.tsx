import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Cable, ChevronLeft, ChevronRight, ClipboardList, Clapperboard,
  FileText, FlaskConical, LayoutDashboard, List, Settings, ShoppingCart, Truck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserMenu } from '@/components/UserMenu'
import { DEFAULT_SETTINGS_CHANGED_EVENT, SettingsService } from '@/lib/settingsService'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useOrganization } from '@/contexts/OrganizationContext'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import {
  DEV_MENU_UPDATED_EVENT, getDevMenuPreference, isDevMenuEnabled,
  setDevMenuEnabled as persistDevMenuEnabled,
} from '@/lib/devMenu'
import { APP_BRANDING_UPDATED_EVENT, loadAppBranding, resolveBrandLogoForTheme } from '@/lib/appBranding'
import { getFieldChecklistNavPath, getProductionsNavPath } from '@/lib/navigationReturn'

const COLLAPSED_KEY = 'trackit:sidebar-collapsed'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  activeBasePath?: string
}

interface NavSection {
  label?: string
  items: NavItem[]
}

// ---------------------------------------------------------------------------
// Sidebar link
// ---------------------------------------------------------------------------

function SidebarLink({
  item,
  collapsed,
  active,
  target,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  target: string
}) {
  return (
    <Link
      to={target}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0 py-2',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const location = useLocation()
  const { authBackend, currentUser } = useAuth()
  const { activeWorkspaceId, activeWorkspaceRole, workspaces } = useWorkspace()
  const { activeOrganizationName } = useOrganization()

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const [mobileTabletUi, setMobileTabletUi] = useState(
    () => SettingsService.loadDefaultSettings().mobileTabletUi,
  )
  const [devMenuEnabled, setDevMenuEnabledState] = useState(() => isDevMenuEnabled())
  const [branding, setBranding] = useState(() => loadAppBranding())
  const [brandLogo, setBrandLogo] = useState(() => resolveBrandLogoForTheme(loadAppBranding()))

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    const sync = () => setMobileTabletUi(SettingsService.loadDefaultSettings().mobileTabletUi)
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    const sync = () => setDevMenuEnabledState(isDevMenuEnabled())
    window.addEventListener(DEV_MENU_UPDATED_EVENT, sync)
    return () => window.removeEventListener(DEV_MENU_UPDATED_EVENT, sync)
  }, [])

  useEffect(() => {
    const sync = () => {
      const next = loadAppBranding()
      setBranding(next)
      setBrandLogo(resolveBrandLogoForTheme(next))
    }
    sync()
    window.addEventListener(APP_BRANDING_UPDATED_EVENT, sync)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', sync)
    return () => {
      window.removeEventListener(APP_BRANDING_UPDATED_EVENT, sync)
      mq.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    const isAdmin = (activeWorkspaceId ? activeWorkspaceRole : currentUser?.role) === 'admin'
    if (!isAdmin || getDevMenuPreference() !== null) return
    persistDevMenuEnabled(true)
  }, [activeWorkspaceId, activeWorkspaceRole, currentUser?.role])

  const productionsNavPath = useMemo(() => getProductionsNavPath(), [location.pathname])
  const fieldChecklistNavPath = useMemo(() => getFieldChecklistNavPath(), [location.pathname])

  const navTarget = (path: string) => {
    if (path === '/productions') return productionsNavPath
    if (path === '/field-checklist') return fieldChecklistNavPath
    return path
  }

  const isActive = (path: string, activeBasePath?: string) => {
    const match = activeBasePath ?? path
    if (match === '/') return location.pathname === '/'
    return location.pathname === match || location.pathname.startsWith(`${match}/`)
  }

  const isAdmin = (activeWorkspaceId ? activeWorkspaceRole : currentUser?.role) === 'admin'
  const showContextChip = isSupabaseConfigured() && authBackend === 'supabase'
  const activeWorkspaceRow = activeWorkspaceId
    ? workspaces.find((w) => w.workspaceId === activeWorkspaceId)
    : undefined
  const activeWorkspaceName = activeWorkspaceRow?.name

  const sections: NavSection[] = useMemo(() => [
    {
      items: [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Operations',
      items: [
        { path: '/productions', label: 'Productions', icon: Clapperboard, activeBasePath: '/productions' },
        { path: '/fleet', label: 'Fleet', icon: Truck, activeBasePath: '/fleet' },
        ...(mobileTabletUi ? [{ path: '/field-checklist', label: 'Field Checklist', icon: ClipboardList }] : []),
      ],
    },
    {
      label: 'Engineering',
      items: [
        { path: '/plant', label: 'Plant', icon: Cable, activeBasePath: '/plant' },
        { path: '/inventory', label: 'Inventory', icon: List },
        { path: '/checkout', label: 'Check-In/Out', icon: ShoppingCart },
      ],
    },
    {
      items: [
        { path: '/reports', label: 'Reports', icon: FileText },
        { path: '/settings', label: 'Settings', icon: Settings, activeBasePath: '/settings' },
        ...(isAdmin && devMenuEnabled ? [{ path: '/dev', label: 'Dev', icon: FlaskConical }] : []),
      ],
    },
  ], [mobileTabletUi, isAdmin, devMenuEnabled])

  // Bottom tab bar items for mobile (max 5; Fleet stays in desktop sidebar only)
  const mobileItems: NavItem[] = [
    { path: '/', label: 'Home', icon: LayoutDashboard },
    { path: '/productions', label: 'Productions', icon: Clapperboard, activeBasePath: '/productions' },
    { path: '/plant', label: 'Plant', icon: Cable, activeBasePath: '/plant' },
    { path: '/inventory', label: 'Inventory', icon: List },
    { path: '/settings', label: 'Settings', icon: Settings, activeBasePath: '/settings' },
  ]

  return (
    <>
      {/* ── Desktop / tablet sidebar ───────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen bg-background border-r shrink-0 transition-[width] duration-200 overflow-hidden',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center gap-2 h-14 px-2 border-b shrink-0',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {!collapsed && (
            <Link
              to="/"
              className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors px-1"
            >
              {brandLogo && (
                <img src={brandLogo} alt="" className="h-6 w-auto shrink-0" />
              )}
              <span className="font-bold text-base truncate leading-tight">
                {branding.appName || 'TEd_trackIT'}
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Workspace context chip */}
        {showContextChip && !collapsed && (
          <div className="px-3 pt-2 pb-0.5">
            <span
              className="block truncate rounded-full border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              title={activeWorkspaceId
                ? `${activeOrganizationName ?? 'Organization'} · ${activeWorkspaceName ?? activeWorkspaceId}`
                : 'Personal inventory'}
            >
              {activeWorkspaceId
                ? `${activeOrganizationName ?? 'Org'} · ${activeWorkspaceName ?? 'Workspace'}`
                : 'Personal'}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-0.5">
          {sections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-3' : ''}>
              {section.label && !collapsed && (
                <p className="px-2 mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <SidebarLink
                  key={item.path}
                  item={item}
                  collapsed={collapsed}
                  active={isActive(item.path, item.activeBasePath)}
                  target={navTarget(item.path)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* User menu */}
        <div className="border-t p-2 shrink-0">
          <UserMenu />
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t flex safe-area-inset-bottom">
        {mobileItems.map((item) => {
          const active = isActive(item.path, item.activeBasePath)
          return (
            <Link
              key={item.path}
              to={navTarget(item.path)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors min-h-[56px]',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
