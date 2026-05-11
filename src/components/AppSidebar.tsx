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
import {
  DEFAULT_MOBILE_BOTTOM_NAV_IDS,
  getMobileNavItems,
  normalizeMobileBottomNavIds,
  type MobileNavItemId,
} from '@/lib/mobileNavigation'

const COLLAPSED_KEY = 'trackit:sidebar-collapsed'

const mobileNavIcons: Record<MobileNavItemId, LucideIcon> = {
  home: LayoutDashboard,
  inventory: List,
  checkout: ShoppingCart,
  fieldChecklist: ClipboardList,
  fleet: Truck,
  productions: Clapperboard,
  plant: Cable,
  reports: FileText,
  settings: Settings,
  help: FileText,
  about: FileText,
  dev: FlaskConical,
}

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
        'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0 py-2',
        active
          ? 'bg-card text-foreground shadow-ti-sm'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
      )}
    >
      {active && !collapsed ? (
        <span className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-primary" aria-hidden />
      ) : null}
      <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} aria-hidden />
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
  const [devMenuEnabled, setDevMenuEnabledState] = useState(() => isDevMenuEnabled())
  const [branding, setBranding] = useState(() => loadAppBranding())
  const [brandLogo, setBrandLogo] = useState(() => resolveBrandLogoForTheme(loadAppBranding()))
  const [defaultSettings, setDefaultSettings] = useState(() => SettingsService.loadDefaultSettings())

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    const sync = () => setDevMenuEnabledState(isDevMenuEnabled())
    window.addEventListener(DEV_MENU_UPDATED_EVENT, sync)
    return () => window.removeEventListener(DEV_MENU_UPDATED_EVENT, sync)
  }, [])

  useEffect(() => {
    const sync = () => setDefaultSettings(SettingsService.loadDefaultSettings())
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, sync)
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
        { path: '/field-checklist', label: 'Field Checklist', icon: ClipboardList },
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
  ], [isAdmin, devMenuEnabled])

  const currentUsername = (currentUser?.username || currentUser?.displayName || 'default').trim() || 'default'
  const mobileItems: NavItem[] = getMobileNavItems(
    normalizeMobileBottomNavIds(defaultSettings.mobileBottomNavByUser?.[currentUsername] ?? DEFAULT_MOBILE_BOTTOM_NAV_IDS)
  )
    .filter((item) => !item.adminOnly || isAdmin)
    .map((item) => ({
      path: item.path,
      label: item.shortLabel,
      icon: mobileNavIcons[item.id],
      activeBasePath: item.activeBasePath,
    }))

  return (
    <>
      {/* ── Desktop / tablet sidebar ───────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen bg-ti-sunken border-r shrink-0 transition-[width] duration-200 overflow-hidden',
          collapsed ? 'w-[60px]' : 'w-[232px]',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-ti-divider px-2',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {!collapsed && (
            <Link
              to="/"
              className="flex min-w-0 items-center gap-2 px-1 transition-colors hover:text-primary"
            >
              {brandLogo && (
                <img src={brandLogo} alt="" className="h-6 w-auto shrink-0" />
              )}
              {!brandLogo && (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ti-ink font-mono text-sm font-semibold tracking-[-0.04em] text-ti-bg shadow-ti-sm">
                  tI
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight tracking-[-0.01em]">
                  {branding.appName || 'trackIT'}
                </span>
                <span className="block truncate text-[10.5px] leading-tight tracking-[0.04em] text-muted-foreground">
                  Production
                </span>
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
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
              className="block truncate rounded-full border bg-card px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-ti-sm"
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
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {sections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-3' : ''}>
              {section.label && !collapsed && (
                <p className="mb-1 px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 select-none">
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
        <div className="shrink-0 border-t border-ti-divider p-2">
          <UserMenu />
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ──────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t bg-card/95 shadow-ti-lg backdrop-blur safe-area-inset-bottom md:hidden">
        {mobileItems.map((item) => {
          const active = isActive(item.path, item.activeBasePath)
          return (
            <Link
              key={item.path}
              to={navTarget(item.path)}
              className={cn(
                'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium tracking-[0.02em] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className={cn('grid h-7 w-10 place-items-center rounded-full', active && 'bg-ti-accent-soft')}>
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
