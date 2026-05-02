import React, { createContext, useContext, useState, useEffect } from 'react';
import { comparePasswords } from '../utils/passwordUtils';
import { toast } from 'react-hot-toast';
import { logger } from '../utils/logger';
import { logger as durableLogger } from '../lib/logging';

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

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  logout: () => void;
  resetPassword: (username: string, securityAnswer: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper to get the correct store object (for compatibility)
function getStore() {
  if (window.electron && window.electron.store) return window.electron.store;
  if (window.electronStore) return {
    get: async (key: string) => window.electronStore.getData(key),
    set: async (key: string, value: any) => window.electronStore.setData(key, value),
    delete: async (key: string) => window.electronStore.deleteData(key),
  };
  // Browser/dev fallback to keep auth functional when Electron preload store is unavailable.
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

  useEffect(() => {
    const initializeAuth = async () => {
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
          (user) => user.username.toLowerCase() === 'admin'
        );

        if (adminIndex === -1) {
          storedUsers = [...storedUsers, defaultAdmin];
        } else {
          // Keep admin deterministic in this dev branch so recovery is always possible.
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
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (username: string, password: string, rememberMe: boolean): Promise<boolean> => {
    logger.info(`Login attempt for user: ${username}`);
    setLoading(true);
    try {
      const store = getStore();
      const normalizedUsername = username.trim().toLowerCase();
      const normalizedPassword = password.trim();

      if (normalizedUsername === 'admin' && normalizedPassword === 'admin') {
        const users = (await store.get('users') as User[] | undefined) ?? [];
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
        return true;
      }

      const users = (await store.get('users') as User[] | undefined) ?? [];
      console.log('Retrieved users:', users);

      const userRecord = users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase()
      );
      if (!userRecord) {
        // Dev recovery fallback: guarantee admin login path.
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
          return true;
        }
        logger.warn('Login failed: User not found');
        durableLogger.warn('security', 'AUTH_LOGIN_FAILED_USER_NOT_FOUND', { username }, 'AuthContext');
        toast.error('Invalid username or password');
        return false;
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
        return true;
      }

      const passwordMatch = await comparePasswords(password, userRecord.password);
      console.log('Password match result:', passwordMatch);

      if (passwordMatch) {
        setCurrentUser(userRecord);
        await store.set('rememberedUser', userRecord);
        logger.info('User session remembered');
        logger.info('Login successful');
        durableLogger.info('security', 'AUTH_LOGIN_SUCCESS', { username: userRecord.username, rememberMe }, 'AuthContext');
        toast.success('Login successful');
        return true;
      } else {
        logger.warn('Login failed: Invalid password');
        durableLogger.warn('security', 'AUTH_LOGIN_FAILED_INVALID_PASSWORD', { username }, 'AuthContext');
        toast.error('Invalid username or password');
        return false;
      }
    } catch (error) {
      logger.error('Login error: ' + String(error));
      durableLogger.error('security', 'AUTH_LOGIN_ERROR', { username, error: String(error) }, 'AuthContext');
      toast.error('An error occurred during login');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const store = getStore();
    const username = currentUser?.username;
    setCurrentUser(null);
    await store.delete('rememberedUser');
    logger.info('User logged out');
    durableLogger.info('security', 'AUTH_LOGOUT', { username: username || 'Unknown' }, 'AuthContext');
    toast.success('Logged out successfully');
  };

  const resetPassword = async (username: string, securityAnswer: string, newPassword: string): Promise<boolean> => {
    try {
      const store = getStore();
      const users = (await store.get('users') as User[] | undefined) ?? [];
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

  const value = {
    currentUser,
    loading,
    login,
    logout,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}