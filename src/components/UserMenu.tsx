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

export function UserMenu() {
  const { currentUser, logout } = useAuth()
  const { activeWorkspaceRole } = useWorkspace()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [devMenuEnabled, setDevMenuEnabledState] = useState(() => isDevMenuEnabled())
  const effectiveRole = activeWorkspaceRole ?? currentUser?.role ?? 'user'
  const isAdmin = effectiveRole === 'admin'

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

  const handleLogout = async () => {
    try {
      await logout()
      window.location.href = '/login'
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  if (!currentUser) return null

  return (
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
        <DropdownMenuItem onClick={handleLogout}>
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
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}