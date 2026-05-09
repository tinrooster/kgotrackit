import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpCircle, Info, LogOut, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DEV_MENU_UPDATED_EVENT, getDevMenuPreference, isDevMenuEnabled, setDevMenuEnabled } from '@/lib/devMenu'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DraggableDialogContent } from '@/components/ui/draggable-dialog'

export function UserMenu() {
  const { currentUser, logout, authBackend, fastSwitchAccounts, reloadFastSwitchAccounts, switchToAccount, updateFastSwitchAccountLastSeenRole, signOutAllUsers } = useAuth()
  const { activeWorkspaceRole } = useWorkspace()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null)
  const [devMenuEnabled, setDevMenuEnabledState] = useState(() => isDevMenuEnabled())
  const effectiveRole = activeWorkspaceRole ?? currentUser?.role ?? 'user'
  const isAdmin = effectiveRole === 'admin'
  const displayRoleForAccount = (
    accountUserId: string,
    accountRole: 'admin' | 'editor' | 'user' | 'viewer',
    accountLastSeenRole?: 'admin' | 'editor' | 'viewer' | 'user'
  ) => {
    if (accountUserId === currentUser?.id) {
      return effectiveRole === 'admin' || effectiveRole === 'editor' || effectiveRole === 'viewer' ? effectiveRole : 'user'
    }
    return accountLastSeenRole ?? accountRole
  }


  useEffect(() => {
    const handleDevMenuUpdated = () => setDevMenuEnabledState(isDevMenuEnabled())
    window.addEventListener(DEV_MENU_UPDATED_EVENT, handleDevMenuUpdated)
    return () => window.removeEventListener(DEV_MENU_UPDATED_EVENT, handleDevMenuUpdated)
  }, [])

  useEffect(() => {
    if (!isAdmin) return;
    if (getDevMenuPreference() !== null) return;
    setDevMenuEnabledState(true);
    setDevMenuEnabled(true);
  }, [isAdmin]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const activeRole = effectiveRole === 'admin' || effectiveRole === 'editor' || effectiveRole === 'viewer' ? effectiveRole : 'user';
    updateFastSwitchAccountLastSeenRole(currentUser.id, activeRole);
  }, [currentUser?.id, effectiveRole, updateFastSwitchAccountLastSeenRole]);

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  const openFastSwitcher = () => {
    reloadFastSwitchAccounts()
    setIsOpen(false)
    setSwitcherOpen(true)
  }

  const handleSwitchAccount = async (userId: string) => {
    if (!userId || userId === currentUser?.id) {
      setSwitcherOpen(false)
      return
    }
    setSwitchingUserId(userId)
    const result = await switchToAccount(userId)
    setSwitchingUserId(null)
    if (!result.ok) {
      const targetAccount = fastSwitchAccounts.find((account) => account.userId === userId)
      const message = result.message || 'Could not switch account'
      if (
        targetAccount &&
        (message.toLowerCase().includes('no active saved session') ||
          message.toLowerCase().includes('saved session expired'))
      ) {
        setSwitcherOpen(false)
        toast.error(message)
        await logout()
        window.location.href = `/login?switchEmail=${encodeURIComponent(targetAccount.username)}`
        return
      }
      toast.error(result.message || 'Could not switch account')
      return
    }
    toast.success('Switched account')
    setSwitcherOpen(false)
  }

  if (!currentUser) return null

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              {currentUser.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium leading-none">{currentUser.displayName}</p>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wide">
                {effectiveRole}
              </Badge>
            </div>
            <p className="text-xs leading-none text-muted-foreground">
              @{currentUser.username}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          navigate('/settings?tab=users');
          setIsOpen(false);
        }}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={openFastSwitcher}
          title={fastSwitchAccounts.length <= 1 ? 'Sign in as another user or clear saved sessions' : 'Pick an account if listed, or sign in again below'}
        >
          <User className="mr-2 h-4 w-4" />
          <span>Switch User</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          navigate('/help');
          setIsOpen(false);
        }}>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          navigate('/about');
          setIsOpen(false);
        }}>
          <Info className="mr-2 h-4 w-4" />
          <span>About</span>
        </DropdownMenuItem>
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={devMenuEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setDevMenuEnabledState(enabled);
                setDevMenuEnabled(enabled);
              }}
            >
              Developer menu
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),520px)]">
        <DialogHeader>
          <DialogTitle>Switch User</DialogTitle>
          <DialogDescription>
            {authBackend === 'supabase'
              ? 'Quick switching between saved accounts is not available yet. Sign in with another email, or clear every saved session on this device.'
              : 'Choose a local account to switch.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {fastSwitchAccounts.length <= 1 ? (
            <p className="text-sm text-muted-foreground">
              {authBackend === 'supabase'
                ? 'No other accounts are listed here. Use "Sign in with a different account" to sign out and enter another email, or "Sign out all users" to remove every saved session.'
                : 'No additional local accounts yet. Create or log in another local user first.'}
            </p>
          ) : (
            fastSwitchAccounts
              .map((account) => (
                <Button
                  key={account.userId}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between px-3 py-2 text-left"
                  onClick={() => void handleSwitchAccount(account.userId)}
                  disabled={switchingUserId === account.userId || account.userId === currentUser?.id}
                >
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span>{account.displayName}</span>
                      <Badge
                        variant={displayRoleForAccount(account.userId, account.role, account.lastSeenRole) === 'admin' ? 'default' : 'secondary'}
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {displayRoleForAccount(account.userId, account.role, account.lastSeenRole)}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">@{account.username}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {account.userId === currentUser?.id
                      ? 'Current'
                      : switchingUserId === account.userId
                        ? 'Switching…'
                        : 'Switch'}
                  </span>
                </Button>
              ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSwitcherOpen(false)}>
            Close
          </Button>
          <Button
            onClick={async () => {
              setSwitcherOpen(false)
              await handleLogout()
            }}
          >
            Sign in with a different account
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              setSwitcherOpen(false)
              await signOutAllUsers()
              window.location.href = '/login'
            }}
          >
            Sign out all users
          </Button>
        </DialogFooter>
        </DraggableDialogContent>
      </Dialog>
    </>
  )
}