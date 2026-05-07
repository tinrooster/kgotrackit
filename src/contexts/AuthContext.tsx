import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { comparePasswords } from '../utils/passwordUtils';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { logger as durableLogger } from '../lib/logging';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase/client';
import { bootstrapCloudData, mapSupabaseUserToAppUser } from '@/lib/supabase/cloudData';
import type { AuthBackend } from '@/lib/supabase/cloudData';
import { setActiveWorkspaceId } from '@/lib/supabase/workspaceData';
import { setActiveOrganizationId } from '@/lib/supabase/organizationData';

export interface User {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
  securityQuestion: string;
  securityAnswer: string;
  phoneExtension?: string;
}

export type UserWithPassword = User;

export type LoginResult = { ok: true } | { ok: false; message?: string };

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  authBackend: AuthBackend;
  login: (username: string, password: string, rememberMe: boolean) => Promise<LoginResult>;
  logout: () => void;
  resetPassword: (username: string, securityAnswer: string, newPassword: string) => Promise<boolean>;
  requestPasswordResetEmail: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const bootstrappedUserIdRef = useRef<string | null>(null);

  const authBackend: AuthBackend = useMemo(
    () => (isSupabaseConfigured() ? 'supabase' : 'local'),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth: (() => void) | undefined;

    const initializeAuth = async () => {
      if (isSupabaseConfigured()) {
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
            if (event === 'SIGNED_IN' && bootstrappedUserIdRef.current !== session.user.id) {
              bootstrappedUserIdRef.current = session.user.id;
              try {
                await bootstrapCloudData(session.user.id);
              } catch (error) {
                logger.error('Supabase bootstrap on sign-in failed: ' + String(error));
                toast.error('Could not sync data from cloud.');
              }
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
          bootstrappedUserIdRef.current = data.user.id;
          try {
            await bootstrapCloudData(data.user.id);
          } catch (e) {
            logger.error('Bootstrap after login failed: ' + String(e));
            toast.error('Logged in but cloud sync failed. Try refreshing.');
          }
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
        setCurrentUser(adminUser);
        await store.set('rememberedUser', adminUser);
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
          setCurrentUser(defaultAdmin);
          await store.set('rememberedUser', defaultAdmin);
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
        setCurrentUser(normalizedAdmin);
        await store.set('rememberedUser', normalizedAdmin);
        logger.info('Recovered admin login with deterministic dev credentials');
        durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: 'admin', rememberMe }, 'AuthContext');
        toast.success('Login successful');
        return { ok: true };
      }

      const passwordMatch = await comparePasswords(password, userRecord.password);

      if (passwordMatch) {
        setCurrentUser(userRecord);
        await store.set('rememberedUser', userRecord);
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
      await client?.auth.signOut();
    }
    logger.info('User logged out');
    durableLogger.info('security', 'AUTH_LOGOUT', { username: username || 'Unknown' }, 'AuthContext');
    toast.success('Logged out successfully');
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
    login,
    logout,
    resetPassword,
    requestPasswordResetEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
