import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { comparePasswords } from '../utils/passwordUtils';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { logger as durableLogger } from '../lib/logging';
import { isSupabaseConfigured, getSupabase, normalizeSupabaseUrl } from '@/lib/supabase/client';
import { bootstrapCloudData, mapSupabaseUserToAppUser } from '@/lib/supabase/cloudData';
import type { AuthBackend } from '@/lib/supabase/cloudData';
import { setActiveWorkspaceId } from '@/lib/supabase/workspaceData';
import { setActiveOrganizationId } from '@/lib/supabase/organizationData';

export interface User {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'editor' | 'user' | 'viewer';
  securityQuestion: string;
  securityAnswer: string;
  phoneExtension?: string;
}

export type UserWithPassword = User;

export type LoginResult = { ok: true } | { ok: false; message?: string };
export type RoleBadge = 'admin' | 'editor' | 'viewer' | 'user';

export interface FastSwitchAccount {
  userId: string;
  username: string;
  displayName: string;
  role: User['role'];
  lastSeenRole?: RoleBadge;
  lastUsedAt: string;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  authBackend: AuthBackend;
  fastSwitchAccounts: FastSwitchAccount[];
  reloadFastSwitchAccounts: () => void;
  updateFastSwitchAccountLastSeenRole: (userId: string, role: RoleBadge) => void;
  signOutAllUsers: () => Promise<void>;
  login: (username: string, password: string, rememberMe: boolean) => Promise<LoginResult>;
  switchToAccount: (userId: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  resetPassword: (username: string, securityAnswer: string, newPassword: string) => Promise<boolean>;
  requestPasswordResetEmail: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const FAST_SWITCH_SESSIONS_KEY = 'trackit:fast-switch-sessions';
const FAST_SWITCH_SESSIONS_LEGACY_KEY = 'fast-switch-sessions';
const FAST_SWITCH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FAST_SWITCH_KNOWN_ACCOUNTS_KEY = 'trackit:fast-switch-known-accounts';
const FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY = 'fast-switch-known-accounts';
const FAST_SWITCH_KNOWN_ACCOUNT_KEYS = [
  FAST_SWITCH_KNOWN_ACCOUNTS_KEY,
  FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY,
  `trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_KEY}`,
  `trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY}`,
];
const FAST_SWITCH_STORAGE_KEYS = [
  FAST_SWITCH_SESSIONS_KEY,
  FAST_SWITCH_SESSIONS_LEGACY_KEY,
  `trackit:${FAST_SWITCH_SESSIONS_KEY}`,
  `trackit:${FAST_SWITCH_SESSIONS_LEGACY_KEY}`,
];

interface FastSwitchSessionRecord {
  userId: string;
  username: string;
  displayName: string;
  role: User['role'];
  lastSeenRole?: RoleBadge;
  accessToken: string;
  refreshToken: string;
  lastUsedAt: string;
}

function normalizeRole(raw: unknown): User['role'] {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'admin' || value === 'editor' || value === 'user' || value === 'viewer') {
    return value;
  }
  return 'user';
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function deriveRoleFromToken(accessToken: string, fallbackRole: User['role']): User['role'] {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return fallbackRole;
  const appMeta =
    payload.app_metadata && typeof payload.app_metadata === 'object'
      ? (payload.app_metadata as Record<string, unknown>)
      : null;
  const userMeta =
    payload.user_metadata && typeof payload.user_metadata === 'object'
      ? (payload.user_metadata as Record<string, unknown>)
      : null;
  return normalizeRole(
    appMeta?.role ??
      appMeta?.user_role ??
      userMeta?.role ??
      userMeta?.user_role ??
      payload.role ??
      fallbackRole
  );
}

function chooseBestRole(primary: User['role'], secondary: User['role']): User['role'] {
  if (primary === 'admin' || secondary === 'admin') return 'admin';
  if (primary === 'editor' || secondary === 'editor') return 'editor';
  if (primary === 'viewer' || secondary === 'viewer') return 'viewer';
  return 'user';
}

function chooseHigherPrivilegeRole(primary: User['role'], secondary: User['role']): User['role'] {
  const rank: Record<User['role'], number> = {
    viewer: 0,
    user: 1,
    editor: 2,
    admin: 3,
  };
  return rank[primary] >= rank[secondary] ? primary : secondary;
}

function normalizeRoleBadge(raw: unknown): RoleBadge {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'admin' || value === 'editor' || value === 'viewer' || value === 'user') {
    return value;
  }
  return 'user';
}

function readFastSwitchRawValue(): unknown {
  for (const key of FAST_SWITCH_STORAGE_KEYS) {
    try {
      const localValue = localStorage.getItem(key);
      if (localValue) return localValue;
    } catch {
      // ignore
    }
    try {
      const electronValue = window.electronStore?.getData?.(key);
      if (electronValue !== undefined && electronValue !== null) return electronValue;
    } catch {
      // ignore
    }
  }
  return null;
}

function parseFastSwitchRecords(raw: unknown): FastSwitchSessionRecord[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed as FastSwitchSessionRecord[];
  } catch {
    return [];
  }
}

function readKnownFastSwitchAccounts(): FastSwitchAccount[] {
  try {
    let raw: unknown = null;
    for (const key of FAST_SWITCH_KNOWN_ACCOUNT_KEYS) {
      if (raw) break;
      try {
        raw = localStorage.getItem(key);
      } catch {
        // ignore
      }
      if (raw) break;
      try {
        raw = window.electronStore?.getData?.(key);
      } catch {
        // ignore
      }
    }
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is FastSwitchAccount => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Record<string, unknown>;
        return (
          typeof candidate.userId === 'string' &&
          typeof candidate.username === 'string' &&
          typeof candidate.displayName === 'string'
        );
      })
      .map((entry) => ({
        ...entry,
        role: normalizeRole(entry.role),
        lastSeenRole: normalizeRoleBadge(entry.lastSeenRole ?? entry.role),
        lastUsedAt: typeof entry.lastUsedAt === 'string' ? entry.lastUsedAt : new Date(0).toISOString(),
      }));
  } catch {
    return [];
  }
}

function writeKnownFastSwitchAccounts(accounts: FastSwitchAccount[]): void {
  const trimmed = [...accounts]
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, 12);
  try {
    localStorage.setItem(FAST_SWITCH_KNOWN_ACCOUNTS_KEY, JSON.stringify(trimmed));
    localStorage.setItem(FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY, JSON.stringify(trimmed));
    localStorage.removeItem(`trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_KEY}`);
    localStorage.removeItem(`trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY}`);
  } catch {
    // ignore localStorage errors
  }
  try {
    window.electronStore?.setData?.(FAST_SWITCH_KNOWN_ACCOUNTS_KEY, trimmed);
    window.electronStore?.setData?.(FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY, trimmed);
    window.electronStore?.deleteData?.(`trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_KEY}`);
    window.electronStore?.deleteData?.(`trackit:${FAST_SWITCH_KNOWN_ACCOUNTS_LEGACY_KEY}`);
  } catch {
    // ignore electron store errors
  }
}

function upsertKnownFastSwitchAccount(account: FastSwitchAccount): FastSwitchAccount[] {
  const existing = readKnownFastSwitchAccounts().filter((row) => row.userId !== account.userId);
  const next = [
    {
      ...account,
      role: normalizeRole(account.role),
      lastSeenRole: normalizeRoleBadge(account.lastSeenRole ?? account.role),
      lastUsedAt: account.lastUsedAt || new Date().toISOString(),
    },
    ...existing,
  ];
  writeKnownFastSwitchAccounts(next);
  return next;
}

function mergeSwitchAccountsWithKnown(sessionAccounts: FastSwitchAccount[]): FastSwitchAccount[] {
  const byUserId = new Map<string, FastSwitchAccount>();
  for (const account of readKnownFastSwitchAccounts()) {
    byUserId.set(account.userId, account);
  }
  for (const account of sessionAccounts) {
    byUserId.set(account.userId, {
      ...byUserId.get(account.userId),
      ...account,
      role: normalizeRole(account.role),
      lastSeenRole: normalizeRoleBadge(account.lastSeenRole ?? account.role),
    });
  }
  return [...byUserId.values()].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

function mapSessionRecordsToAccounts(records: FastSwitchSessionRecord[]): FastSwitchAccount[] {
  return records.map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({
    userId,
    username,
    displayName,
    role,
    lastSeenRole,
    lastUsedAt,
  }));
}

function readFastSwitchSessionRecords(): FastSwitchSessionRecord[] {
  try {
    const raw = readFastSwitchRawValue();
    if (!raw) return [];
    const parsed = parseFastSwitchRecords(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = parsed
      .filter((entry): entry is FastSwitchSessionRecord => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Record<string, unknown>;
      const lastUsedAt =
        typeof candidate.lastUsedAt === 'string' ? Date.parse(candidate.lastUsedAt) : Number.NaN;
      return (
        typeof candidate.userId === 'string' &&
        typeof candidate.username === 'string' &&
        typeof candidate.displayName === 'string' &&
        (candidate.role === 'admin' || candidate.role === 'editor' || candidate.role === 'user' || candidate.role === 'viewer') &&
        typeof candidate.accessToken === 'string' &&
        typeof candidate.refreshToken === 'string' &&
        typeof candidate.lastUsedAt === 'string' &&
        Number.isFinite(lastUsedAt) &&
        now - lastUsedAt <= FAST_SWITCH_MAX_AGE_MS
      );
      })
      .map((record) => ({
        ...record,
        role: deriveRoleFromToken(record.accessToken, normalizeRole(record.role)),
        lastSeenRole: normalizeRoleBadge(record.lastSeenRole ?? record.role),
      }));
    writeFastSwitchSessionRecords(valid);
    return valid;
  } catch {
    return [];
  }
}

function writeFastSwitchSessionRecords(records: FastSwitchSessionRecord[]): void {
  const aged = records
    .filter((record) => {
      const parsedLastUsedAt = Date.parse(record.lastUsedAt);
      return Number.isFinite(parsedLastUsedAt) && Date.now() - parsedLastUsedAt <= FAST_SWITCH_MAX_AGE_MS;
    })
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, 8);
  try {
    localStorage.setItem(FAST_SWITCH_SESSIONS_KEY, JSON.stringify(aged));
    localStorage.removeItem(FAST_SWITCH_SESSIONS_LEGACY_KEY);
    localStorage.removeItem(`trackit:${FAST_SWITCH_SESSIONS_KEY}`);
    localStorage.removeItem(`trackit:${FAST_SWITCH_SESSIONS_LEGACY_KEY}`);
  } catch {
    // ignore localStorage write errors
  }
  try {
    window.electronStore?.setData?.(FAST_SWITCH_SESSIONS_KEY, aged);
    window.electronStore?.deleteData?.(FAST_SWITCH_SESSIONS_LEGACY_KEY);
    window.electronStore?.deleteData?.(`trackit:${FAST_SWITCH_SESSIONS_KEY}`);
    window.electronStore?.deleteData?.(`trackit:${FAST_SWITCH_SESSIONS_LEGACY_KEY}`);
  } catch {
    // ignore electron store write errors
  }
}

function cacheFastSwitchSession(record: FastSwitchSessionRecord): FastSwitchSessionRecord[] {
  const existing = readFastSwitchSessionRecords().filter((row) => row.userId !== record.userId);
  const normalizedRecord = {
    ...record,
    role: deriveRoleFromToken(record.accessToken, normalizeRole(record.role)),
    lastSeenRole: normalizeRoleBadge(record.lastSeenRole ?? record.role),
  };
  const next = [normalizedRecord, ...existing].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt)).slice(0, 8);
  writeFastSwitchSessionRecords(next);
  return next;
}

function removeFastSwitchSession(userId: string): FastSwitchSessionRecord[] {
  const next = readFastSwitchSessionRecords().filter((record) => record.userId !== userId);
  writeFastSwitchSessionRecords(next);
  return next;
}

function clearFastSwitchSessions(): void {
  try {
    for (const key of FAST_SWITCH_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    try {
      for (const key of FAST_SWITCH_STORAGE_KEYS) {
        window.electronStore?.deleteData?.(key);
      }
      for (const key of FAST_SWITCH_KNOWN_ACCOUNT_KEYS) {
        window.electronStore?.deleteData?.(key);
      }
    } catch {
      // ignore
    }
    for (const key of FAST_SWITCH_KNOWN_ACCOUNT_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function updateCachedFastSwitchLastSeenRole(userId: string, role: RoleBadge): FastSwitchSessionRecord[] {
  const normalizedLastSeenRole = normalizeRoleBadge(role);
  const next = readFastSwitchSessionRecords().map((record) =>
    record.userId === userId
      ? {
          ...record,
          lastSeenRole: normalizedLastSeenRole,
        }
      : record
  );
  writeFastSwitchSessionRecords(next);
  return next;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getStore() {
  const electronStore = window.electronStore;
  if (electronStore) return {
    get: async (key: string) => electronStore.getData(key),
    set: async (key: string, value: any) => electronStore.setData(key, value),
    delete: async (key: string) => electronStore.deleteData(key),
  };
  return {
    get: async (key: string) => {
      const rawValue = localStorage.getItem(`trackit:${key}`);
      return rawValue ? JSON.parse(rawValue) : undefined;
    },
    set: async (key: string, value: any) => {
      localStorage.setItem(`trackit:${key}`, JSON.stringify(value));
    },
    delete: async (key: string) => {
      localStorage.removeItem(`trackit:${key}`);
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [fastSwitchAccounts, setFastSwitchAccounts] = useState<FastSwitchAccount[]>([]);
  const inMemoryKnownAccountsRef = useRef<FastSwitchAccount[]>([]);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const switchingSessionRef = useRef(false);

  const authBackend: AuthBackend = useMemo(
    () => (isSupabaseConfigured() ? 'supabase' : 'local'),
    []
  );

  const refreshLocalFastSwitchAccounts = async (): Promise<void> => {
    try {
      const store = getStore();
      const users = ((await store.get('users')) as User[] | undefined) ?? [];
      const mapped = users
        .filter((user) => Boolean(user?.id))
        .map((user) => ({
          userId: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
          lastSeenRole: normalizeRoleBadge(user.role),
          lastUsedAt: new Date(0).toISOString(),
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
      setFastSwitchAccounts(mapped);
    } catch {
      setFastSwitchAccounts([]);
    }
  };

  const scheduleBootstrap = (userId: string) => {
    window.setTimeout(() => {
      if (bootstrappedUserIdRef.current === userId) {
        return;
      }
      bootstrappedUserIdRef.current = userId;
      void bootstrapCloudData(userId).catch((error) => {
        logger.error('Deferred Supabase bootstrap failed: ' + String(error));
        toast.error('Could not sync data from cloud.');
      });
    }, 250);
  };

  const reloadFastSwitchAccounts = () => {
    const sessionAccounts = mapSessionRecordsToAccounts(readFastSwitchSessionRecords());
    const merged = mergeSwitchAccountsWithKnown(sessionAccounts);
    if (merged.length > 1) {
      inMemoryKnownAccountsRef.current = merged;
      setFastSwitchAccounts(merged);
      return;
    }
    if (inMemoryKnownAccountsRef.current.length > 1) {
      setFastSwitchAccounts(inMemoryKnownAccountsRef.current);
      return;
    }
    setFastSwitchAccounts(merged);
  };

  const updateFastSwitchAccountLastSeenRole = (userId: string, role: RoleBadge) => {
    if (!userId) return;
    if (isSupabaseConfigured()) {
      setFastSwitchAccounts(
        updateCachedFastSwitchLastSeenRole(userId, role).map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({
          userId,
          username,
          displayName,
          role,
          lastSeenRole,
          lastUsedAt,
        }))
      );
      return;
    }
    setFastSwitchAccounts((previous) =>
      previous.map((account) =>
        account.userId === userId
          ? {
              ...account,
              lastSeenRole: normalizeRoleBadge(role),
            }
          : account
      )
    );
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth: (() => void) | undefined;

    const initializeAuth = async () => {
      if (isSupabaseConfigured()) {
        reloadFastSwitchAccounts();
        const client = getSupabase();
        if (!client) {
          setLoading(false);
          return;
        }
        try {
          const { data: { session } } = await client.auth.getSession();
          if (cancelled) return;
          if (session?.user) {
            if (session.user.app_metadata?.disabled === true) {
              await client.auth.signOut();
              setCurrentUser(null);
              toast.error('Your account is disabled. Contact an administrator.');
              setLoading(false);
              return;
            }
            const mapped = mapSupabaseUserToAppUser(session.user) as User;
            setCurrentUser(mapped);
            setFastSwitchAccounts(
              mergeSwitchAccountsWithKnown(cacheFastSwitchSession({
                userId: session.user.id,
                username: mapped.username,
                displayName: mapped.displayName,
                role: mapped.role,
                lastSeenRole: normalizeRoleBadge(mapped.role),
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                lastUsedAt: new Date().toISOString(),
              }).map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({ userId, username, displayName, role, lastSeenRole, lastUsedAt })))
            );
            const knownAccounts = upsertKnownFastSwitchAccount({
              userId: session.user.id,
              username: mapped.username,
              displayName: mapped.displayName,
              role: mapped.role,
              lastSeenRole: normalizeRoleBadge(mapped.role),
              lastUsedAt: new Date().toISOString(),
            });
            inMemoryKnownAccountsRef.current = knownAccounts;
            try {
              await bootstrapCloudData(session.user.id);
            } catch (error) {
              logger.error('Supabase bootstrap failed: ' + String(error));
              toast.error('Could not sync data from cloud. You can retry by refreshing.');
            }
            bootstrappedUserIdRef.current = session.user.id;
          }

          const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
            if (cancelled) return;
            if (event === 'SIGNED_OUT') {
              if (switchingSessionRef.current) {
                return;
              }
              bootstrappedUserIdRef.current = null;
              setCurrentUser(null);
              return;
            }
            if (!session?.user) {
              return;
            }
            if (session.user.app_metadata?.disabled === true) {
              await client.auth.signOut();
              setCurrentUser(null);
              toast.error('Your account is disabled. Contact an administrator.');
              return;
            }
            const mapped = mapSupabaseUserToAppUser(session.user) as User;
            setCurrentUser(mapped);
            if (session.access_token && session.refresh_token) {
              setFastSwitchAccounts(
                mergeSwitchAccountsWithKnown(cacheFastSwitchSession({
                  userId: session.user.id,
                  username: mapped.username,
                  displayName: mapped.displayName,
                  role: mapped.role,
                  lastSeenRole: normalizeRoleBadge(mapped.role),
                  accessToken: session.access_token,
                  refreshToken: session.refresh_token,
                  lastUsedAt: new Date().toISOString(),
                }).map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({ userId, username, displayName, role, lastSeenRole, lastUsedAt })))
              );
              const knownAccounts = upsertKnownFastSwitchAccount({
                userId: session.user.id,
                username: mapped.username,
                displayName: mapped.displayName,
                role: mapped.role,
                lastSeenRole: normalizeRoleBadge(mapped.role),
                lastUsedAt: new Date().toISOString(),
              });
              inMemoryKnownAccountsRef.current = knownAccounts;
            }
            if (event === 'SIGNED_IN') {
              scheduleBootstrap(session.user.id);
            }
          });
          unsubscribeAuth = () => subscription.unsubscribe();
        } catch (error) {
          logger.error('Supabase auth init error: ' + String(error));
          toast.error('Authentication service error');
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      try {
        const store = getStore();
        let storedUsers = await store.get('users');
        const defaultAdmin: User = {
          id: crypto.randomUUID(),
          username: 'admin',
          displayName: 'Administrator',
          password: 'admin',
          role: 'admin',
          securityQuestion: 'What is the default password?',
          securityAnswer: 'admin',
        };

        if (!Array.isArray(storedUsers)) {
          storedUsers = [];
        }

        const adminIndex = storedUsers.findIndex(
          (user: User) => user.username.toLowerCase() === 'admin'
        );

        if (adminIndex === -1) {
          storedUsers = [...storedUsers, defaultAdmin];
        } else {
          storedUsers[adminIndex] = {
            ...storedUsers[adminIndex],
            username: 'admin',
            displayName: 'Administrator',
            password: 'admin',
            role: 'admin',
            securityQuestion: 'What is the default password?',
            securityAnswer: 'admin',
          };
        }

        await store.set('users', storedUsers);
        logger.info('Ensured default admin account is available');
        await refreshLocalFastSwitchAccounts();

        const rememberedUser = await store.get('rememberedUser');
        if (rememberedUser) {
          setCurrentUser(rememberedUser);
          logger.info('Restored remembered user session');
        }
      } catch (error) {
        logger.error('Error initializing auth: ' + String(error));
        toast.error('Error initializing authentication');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void initializeAuth();
    return () => {
      cancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!currentUser?.id) return;
    const known = upsertKnownFastSwitchAccount({
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      role: currentUser.role,
      lastSeenRole: normalizeRoleBadge(currentUser.role),
      lastUsedAt: new Date().toISOString(),
    });
    inMemoryKnownAccountsRef.current = known;
    const sessionAccounts = mapSessionRecordsToAccounts(readFastSwitchSessionRecords());
    const merged = mergeSwitchAccountsWithKnown(sessionAccounts);
    if (merged.length > 0) {
      setFastSwitchAccounts(merged);
      return;
    }
    setFastSwitchAccounts(known);
  }, [currentUser?.displayName, currentUser?.id, currentUser?.role, currentUser?.username]);

  const login = async (username: string, password: string, rememberMe: boolean): Promise<LoginResult> => {
    logger.info(`Login attempt for user: ${username}`);
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const client = getSupabase();
        if (!client) {
          return { ok: false, message: 'Auth is not configured' };
        }
        const email = username.trim();
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password: password.trim(),
        });
        if (error) {
          const detail =
            error.message ||
            ('msg' in error && typeof (error as { msg?: string }).msg === 'string'
              ? (error as { msg: string }).msg
              : '') ||
            'Invalid login credentials';
          logger.warn('Supabase login failed: ' + detail);
          durableLogger.warn('security', 'AUTH_LOGIN_FAILED', { username: email, error: detail }, 'AuthContext');
          return { ok: false, message: detail };
        }
        if (data.user) {
          if (data.user.app_metadata?.disabled === true) {
            await client.auth.signOut();
            durableLogger.warn('security', 'AUTH_LOGIN_FAILED', { username: email, error: 'Account disabled' }, 'AuthContext');
            return { ok: false, message: 'Account is disabled. Contact an administrator.' };
          }
          const mapped = mapSupabaseUserToAppUser(data.user) as User;
          setCurrentUser(mapped);
          if (data.session?.access_token && data.session?.refresh_token) {
            setFastSwitchAccounts(
              mergeSwitchAccountsWithKnown(cacheFastSwitchSession({
                userId: data.user.id,
                username: mapped.username,
                displayName: mapped.displayName,
                role: mapped.role,
                lastSeenRole: normalizeRoleBadge(mapped.role),
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                lastUsedAt: new Date().toISOString(),
              }).map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({ userId, username, displayName, role, lastSeenRole, lastUsedAt })))
            );
            const knownAccounts = upsertKnownFastSwitchAccount({
              userId: data.user.id,
              username: mapped.username,
              displayName: mapped.displayName,
              role: mapped.role,
              lastSeenRole: normalizeRoleBadge(mapped.role),
              lastUsedAt: new Date().toISOString(),
            });
            inMemoryKnownAccountsRef.current = knownAccounts;
          }
          bootstrappedUserIdRef.current = null;
          scheduleBootstrap(data.user.id);
          durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: email, rememberMe }, 'AuthContext');
          toast.success('Login successful');
          return { ok: true };
        }
        return { ok: false, message: 'Sign-in failed with no user returned.' };
      }

      const store = getStore();
      const normalizedUsername = username.trim().toLowerCase();
      const normalizedPassword = password.trim();

      if (normalizedUsername === 'admin' && normalizedPassword === 'admin') {
        const users = ((await store.get('users')) as User[] | undefined) ?? [];
        const adminUser: User = {
          id: users.find((user) => user.username.toLowerCase() === 'admin')?.id ?? crypto.randomUUID(),
          username: 'admin',
          displayName: 'Administrator',
          password: 'admin',
          role: 'admin',
          securityQuestion: 'What is the default password?',
          securityAnswer: 'admin',
        };

        const updatedUsers = users.some((user) => user.username.toLowerCase() === 'admin')
          ? users.map((user) => (user.username.toLowerCase() === 'admin' ? adminUser : user))
          : [...users, adminUser];

        await store.set('users', updatedUsers);
        await refreshLocalFastSwitchAccounts();
        setCurrentUser(adminUser);
        if (rememberMe) {
          await store.set('rememberedUser', adminUser);
        } else {
          await store.delete('rememberedUser');
        }
        logger.info('Admin dev login override applied');
        durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: 'admin', rememberMe }, 'AuthContext');
        toast.success('Login successful');
        return { ok: true };
      }

      const users = ((await store.get('users')) as User[] | undefined) ?? [];

      const userRecord = users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase()
      );
      if (!userRecord) {
        if (normalizedUsername === 'admin' && normalizedPassword === 'admin') {
          const defaultAdmin: User = {
            id: crypto.randomUUID(),
            username: 'admin',
            displayName: 'Administrator',
            password: 'admin',
            role: 'admin',
            securityQuestion: 'What is the default password?',
            securityAnswer: 'admin',
          };
          await store.set('users', [...users, defaultAdmin]);
          await refreshLocalFastSwitchAccounts();
          setCurrentUser(defaultAdmin);
          if (rememberMe) {
            await store.set('rememberedUser', defaultAdmin);
          } else {
            await store.delete('rememberedUser');
          }
          logger.info('Recovered missing admin account during login');
          durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: 'admin', rememberMe }, 'AuthContext');
          toast.success('Login successful');
          return { ok: true };
        }
        logger.warn('Login failed: User not found');
        durableLogger.warn('security', 'AUTH_LOGIN_FAILED_USER_NOT_FOUND', { username }, 'AuthContext');
        return { ok: false, message: 'Invalid username or password' };
      }

      if (normalizedUsername === 'admin' && normalizedPassword === 'admin') {
        const normalizedAdmin: User = {
          ...userRecord,
          username: 'admin',
          displayName: 'Administrator',
          password: 'admin',
          role: 'admin',
          securityQuestion: 'What is the default password?',
          securityAnswer: 'admin',
        };
        const updatedUsers = users.map((user) =>
          user.id === userRecord.id ? normalizedAdmin : user
        );
        await store.set('users', updatedUsers);
        await refreshLocalFastSwitchAccounts();
        setCurrentUser(normalizedAdmin);
        if (rememberMe) {
          await store.set('rememberedUser', normalizedAdmin);
        } else {
          await store.delete('rememberedUser');
        }
        logger.info('Recovered admin login with deterministic dev credentials');
        durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: 'admin', rememberMe }, 'AuthContext');
        toast.success('Login successful');
        return { ok: true };
      }

      const passwordMatch = await comparePasswords(password, userRecord.password);

      if (passwordMatch) {
        await refreshLocalFastSwitchAccounts();
        setCurrentUser(userRecord);
        if (rememberMe) {
          await store.set('rememberedUser', userRecord);
        } else {
          await store.delete('rememberedUser');
        }
        logger.info('User session remembered');
        logger.info('Login successful');
        durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: userRecord.username, rememberMe }, 'AuthContext');
        toast.success('Login successful');
        return { ok: true };
      }
      logger.warn('Login failed: Invalid password');
      durableLogger.warn('security', 'AUTH_LOGIN_FAILED_INVALID_PASSWORD', { username }, 'AuthContext');
      return { ok: false, message: 'Invalid username or password' };
    } catch (error) {
      const hint = error instanceof Error ? error.message : String(error);
      logger.error('Login error: ' + hint);
      durableLogger.error('security', 'AUTH_LOGIN_ERROR', { username, error: hint }, 'AuthContext');
      return {
        ok: false,
        message: `Sign-in error: ${hint}. If this mentions fetch or network, check browser extensions, VPN, and that your Supabase project is up.`,
      };
    } finally {
      setLoading(false);
    }
  };

  const switchToAccount = async (userId: string): Promise<LoginResult> => {
    if (!userId) {
      return { ok: false, message: 'No account selected.' };
    }
    if (!isSupabaseConfigured()) {
      try {
        const store = getStore();
        const users = ((await store.get('users')) as User[] | undefined) ?? [];
        const targetUser = users.find((user) => user.id === userId);
        if (!targetUser) {
          return { ok: false, message: 'That local account no longer exists.' };
        }
        setLoading(true);
        setCurrentUser(targetUser);
        await store.set('rememberedUser', targetUser);
        await refreshLocalFastSwitchAccounts();
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not switch local account.';
        return { ok: false, message };
      } finally {
        setLoading(false);
      }
    }
    const client = getSupabase();
    if (!client) {
      return { ok: false, message: 'Auth is not configured' };
    }
    const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      return { ok: false, message: 'Auth is not configured' };
    }
    const target = readFastSwitchSessionRecords().find((record) => record.userId === userId);
    if (!target) {
      return { ok: false, message: 'No active saved session for that account. Log in as that user once to re-enable quick switch.' };
    }
    if (switchingSessionRef.current) {
      return { ok: false, message: 'A switch is already in progress. Try again in a moment.' };
    }
    switchingSessionRef.current = true;
    setLoading(true);
    try {
      const previousSessionResult = await client.auth.getSession();
      const previousSession = previousSessionResult.data.session;
      const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      // Refresh/validate target session in isolation to avoid lock races on the active client.
      const isolatedSessionResult = await isolatedClient.auth.setSession({
        access_token: target.accessToken,
        refresh_token: target.refreshToken,
      });
      const isolatedData = isolatedSessionResult.data;
      const isolatedError = isolatedSessionResult.error;
      if (isolatedError || !isolatedData.user || !isolatedData.session) {
        if (previousSession?.access_token && previousSession?.refresh_token) {
          await client.auth.setSession({
            access_token: previousSession.access_token,
            refresh_token: previousSession.refresh_token,
          });
        }
        const rawErrorMessage = isolatedError?.message?.toLowerCase() || '';
        if (rawErrorMessage.includes('auth session missing') || rawErrorMessage.includes('stole it')) {
          return { ok: false, message: 'Saved session expired for that account. Use "Log in as different user" once to refresh it.' };
        }
        return { ok: false, message: isolatedError?.message || 'Session expired. Log in again for this account.' };
      }

      // Apply refreshed target session to active client.
      const sessionResult = await client.auth.setSession({
        access_token: isolatedData.session.access_token,
        refresh_token: isolatedData.session.refresh_token,
      });
      const { data, error } = sessionResult;
      if (error || !data.user || !data.session) {
        if (previousSession?.access_token && previousSession?.refresh_token) {
          await client.auth.setSession({
            access_token: previousSession.access_token,
            refresh_token: previousSession.refresh_token,
          });
        }
        return { ok: false, message: error?.message || 'Could not activate switched account session.' };
      }

      const mapped = mapSupabaseUserToAppUser(data.user) as User;
      setCurrentUser(mapped);
      setFastSwitchAccounts(
        cacheFastSwitchSession({
          userId: data.user.id,
          username: data.user.email ?? target.username,
          displayName: (data.user.user_metadata?.display_name as string | undefined) || target.displayName,
          role: chooseBestRole(
            normalizeRole(
              data.user.app_metadata?.role ??
                data.user.app_metadata?.user_role ??
                data.user.user_metadata?.role ??
                data.user.user_metadata?.user_role
            ),
            mapped.role
          ),
          lastSeenRole: normalizeRoleBadge(target.lastSeenRole ?? mapped.role),
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          lastUsedAt: new Date().toISOString(),
        }).map(({ userId, username, displayName, role, lastSeenRole, lastUsedAt }) => ({ userId, username, displayName, role, lastSeenRole, lastUsedAt }))
      );
      bootstrappedUserIdRef.current = null;
      scheduleBootstrap(data.user.id);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not switch account.';
      return { ok: false, message };
    } finally {
      window.setTimeout(() => {
        switchingSessionRef.current = false;
      }, 750);
      setLoading(false);
    }
  };

  const logout = async () => {
    const store = getStore();
    const username = currentUser?.username;
    setCurrentUser(null);
    bootstrappedUserIdRef.current = null;
    await store.delete('rememberedUser');
    setActiveWorkspaceId(null);
    setActiveOrganizationId(null);
    if (isSupabaseConfigured()) {
      const client = getSupabase();
      // Keep cached multi-account switch tokens intact for "Switch User" flows.
      await client?.auth.signOut({ scope: 'local' });
    }
    logger.info('User logged out');
    durableLogger.info('security', 'AUTH_LOGOUT', { username: username || 'Unknown' }, 'AuthContext');
    toast.success('Logged out successfully');
  };

  const signOutAllUsers = async () => {
    const store = getStore();
    const username = currentUser?.username;
    setCurrentUser(null);
    bootstrappedUserIdRef.current = null;
    setFastSwitchAccounts([]);
    inMemoryKnownAccountsRef.current = [];
    clearFastSwitchSessions();
    await store.delete('rememberedUser');
    setActiveWorkspaceId(null);
    setActiveOrganizationId(null);
    if (isSupabaseConfigured()) {
      const client = getSupabase();
      await client?.auth.signOut();
    }
    durableLogger.info('security', 'AUTH_SIGN_OUT_ALL', { username: username || 'Unknown' }, 'AuthContext');
    toast.success('Signed out all users on this device');
  };

  const resetPassword = async (username: string, securityAnswer: string, newPassword: string): Promise<boolean> => {
    if (isSupabaseConfigured()) {
      toast.error('Use the email reset link flow when using cloud sign-in.');
      return false;
    }
    try {
      const store = getStore();
      const users = ((await store.get('users')) as User[] | undefined) ?? [];
      const userIndex = users.findIndex(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase()
      );

      if (userIndex === -1) {
        logger.warn('Password reset failed: User not found');
        durableLogger.warn('security', 'AUTH_PASSWORD_RESET_FAILED_USER_NOT_FOUND', { username }, 'AuthContext');
        toast.error('User not found');
        return false;
      }

      const normalizedUsername = username.trim().toLowerCase();
      const normalizedSecurityAnswer = securityAnswer.trim().toLowerCase();
      const storedSecurityAnswer = (users[userIndex].securityAnswer ?? '').trim().toLowerCase();

      if (
        !(normalizedUsername === 'admin' && normalizedSecurityAnswer === 'admin') &&
        storedSecurityAnswer !== normalizedSecurityAnswer
      ) {
        logger.warn('Password reset failed: Incorrect security answer');
        durableLogger.warn('security', 'AUTH_PASSWORD_RESET_FAILED_INCORRECT_SECURITY_ANSWER', { username }, 'AuthContext');
        toast.error('Incorrect security answer');
        return false;
      }

      users[userIndex].password = newPassword;
      await store.set('users', users);

      logger.info('Password reset successful');
      durableLogger.info('security', 'AUTH_PASSWORD_RESET_SUCCESS', { username }, 'AuthContext');
      toast.success('Password reset successful');
      return true;
    } catch (error) {
      logger.error('Password reset error: ' + String(error));
      durableLogger.error('security', 'AUTH_PASSWORD_RESET_ERROR', { username, error: String(error) }, 'AuthContext');
      toast.error('An error occurred during password reset');
      return false;
    }
  };

  const requestPasswordResetEmail = async (email: string): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
      toast.error('Cloud password reset is not enabled.');
      return false;
    }
    const client = getSupabase();
    if (!client) {
      return false;
    }
    try {
      const redirectTo = `${window.location.origin}/`;
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success('If an account exists for that email, a reset link was sent.');
      durableLogger.info('security', 'AUTH_PASSWORD_RESET_EMAIL_REQUESTED', { email: email.trim() }, 'AuthContext');
      return true;
    } catch (error) {
      logger.error('Password reset email error: ' + String(error));
      toast.error('Could not send reset email');
      return false;
    }
  };

  const value = {
    currentUser,
    loading,
    authBackend,
    fastSwitchAccounts,
    reloadFastSwitchAccounts,
    updateFastSwitchAccountLastSeenRole,
    signOutAllUsers,
    login,
    switchToAccount,
    logout,
    resetPassword,
    requestPasswordResetEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
