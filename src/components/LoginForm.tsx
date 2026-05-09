import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2, LogIn, Key, Mail } from 'lucide-react';
import { getSupabase, getSupabaseConfigDiagnostics } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DraggableDialogContent } from '@/components/ui/draggable-dialog';
import type { UserWithPassword, LoginResult } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { useLocation } from 'react-router-dom';
import { APP_BRANDING_UPDATED_EVENT, loadAppBranding, resolveBrandLogoForTheme } from '@/lib/appBranding';

const LAST_ROUTE_STORAGE_KEY = 'trackit:last-route';

function normalizeLoginResult(raw: LoginResult | boolean): LoginResult {
  if (typeof raw === 'boolean') {
    return raw
      ? { ok: true }
      : {
          ok: false,
          message:
            'Sign-in failed. This build may be outdated, or cloud auth is misconfigured. Redeploy with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
        };
  }
  return raw;
}

// Initialize logger with login context
logger.setContext('login');

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().default(false),
});

function buildResetPasswordSchema(isSupabase: boolean) {
  if (isSupabase) {
    return z.object({
      username: z.string().min(1, 'Email is required').email('Enter a valid email'),
      securityAnswer: z.string().optional(),
      newPassword: z.string().optional(),
    });
  }
  return z.object({
    username: z.string().min(1, 'Username is required'),
    securityAnswer: z.string().min(1, 'Security answer is required'),
    newPassword: z.string().min(4, 'Password must be at least 4 characters'),
  });
}

type LoginFormValues = z.infer<typeof loginSchema>;
type ResetPasswordValues = z.infer<ReturnType<typeof buildResetPasswordSchema>>;

export function LoginForm() {
  const { login, resetPassword, authBackend, requestPasswordResetEmail } = useAuth();
  const supabaseConfigDiagnostics = useMemo(() => getSupabaseConfigDiagnostics(), []);
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isResetPasswordVisible, setIsResetPasswordVisible] = useState(false);
  const [branding, setBranding] = useState(() => loadAppBranding());
  const [brandLogo, setBrandLogo] = useState(() => resolveBrandLogoForTheme(loadAppBranding()));

  const resetSchema = useMemo(
    () => buildResetPasswordSchema(authBackend === 'supabase'),
    [authBackend]
  );

  const { register, handleSubmit, formState: { errors }, getValues, watch: watchLogin, setValue } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      remember: false,
    },
  });

  const { register: registerReset, handleSubmit: handleResetSubmit, formState: { errors: resetErrors }, watch: watchReset } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      username: '',
      securityAnswer: '',
      newPassword: '',
    },
  });

  const [securityQuestion, setSecurityQuestion] = useState<string>('');
  const [magicBusy, setMagicBusy] = useState(false);
  const resetUsername = watchReset('username');
  const loginEmail = watchLogin('username');

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const switchEmail = search.get('switchEmail');
    if (switchEmail && authBackend === 'supabase') {
      setValue('username', switchEmail);
    }
  }, [authBackend, location.search, setValue]);

  useEffect(() => {
    const syncBranding = () => {
      const nextBranding = loadAppBranding();
      setBranding(nextBranding);
      setBrandLogo(resolveBrandLogoForTheme(nextBranding));
    };
    syncBranding();
    window.addEventListener(APP_BRANDING_UPDATED_EVENT, syncBranding);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncBranding);
    return () => {
      window.removeEventListener(APP_BRANDING_UPDATED_EVENT, syncBranding);
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', syncBranding);
    };
  }, []);

  const getPostLoginDestination = (): string => {
    const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const from = state?.from;
    if (from?.pathname) {
      return `${from.pathname ?? ''}${from.search ?? ''}${from.hash ?? ''}`;
    }
    try {
      return sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY) || '/';
    } catch {
      return '/';
    }
  };

  const sendMagicLink = async () => {
    const email = loginEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email in the field above.');
      return;
    }
    const client = getSupabase();
    if (!client) {
      toast.error('Supabase is not configured.');
      return;
    }
    setMagicBusy(true);
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) {
        toast.error(error.message || 'Could not send link');
        return;
      }
      toast.success('Check your email for the sign-in link.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send link');
    } finally {
      setMagicBusy(false);
    }
  };

  // Fetch security question when username changes
  useEffect(() => {
    const fetchSecurityQuestion = async () => {
      if (authBackend === 'supabase') {
        setSecurityQuestion('');
        return;
      }
      if (!resetUsername) {
        setSecurityQuestion('');
        return;
      }

      const storeUsers = (window.electronStore?.getData?.('users') as UserWithPassword[] | undefined) ??
        (() => {
          const rawValue = localStorage.getItem('trackit:users');
          return rawValue ? (JSON.parse(rawValue) as UserWithPassword[]) : [];
        })();
      const user = storeUsers.find(
        (u) => u.username.toLowerCase() === resetUsername.trim().toLowerCase()
      );
      setSecurityQuestion(user?.securityQuestion || '');
    };

    fetchSecurityQuestion();
  }, [resetUsername, authBackend]);

  const onSubmit = async (data: LoginFormValues) => {
    console.log('Form submitted with:', { username: data.username, remember: data.remember });
    logger.log(`Login attempt for user: ${data.username}`);
    setIsLoading(true);
    setLoginError(null);

    try {
      const normalizedUsername = data.username.trim().toLowerCase();
      const normalizedPassword = data.password.trim();

      if (
        authBackend === 'local' &&
        normalizedUsername === 'admin' &&
        normalizedPassword === 'admin' &&
        window.electronStore
      ) {
        const existingUsers = (window.electronStore.getData('users') as UserWithPassword[] | undefined) ?? [];
        const adminUser = {
          id: existingUsers.find((user) => user.username.toLowerCase() === 'admin')?.id ?? crypto.randomUUID(),
          username: 'admin',
          displayName: 'Administrator',
          password: 'admin',
          role: 'admin',
          securityQuestion: 'What is the default password?',
          securityAnswer: 'admin',
        };

        const updatedUsers = existingUsers.some((user) => user.username.toLowerCase() === 'admin')
          ? existingUsers.map((user) => (user.username.toLowerCase() === 'admin' ? adminUser : user))
          : [...existingUsers, adminUser];

        window.electronStore.setData('users', updatedUsers);
        if (data.remember) {
          window.electronStore.setData('rememberedUser', adminUser);
        } else {
          window.electronStore.deleteData('rememberedUser');
        }
        toast.success('Admin login recovered. Reloading...');
        window.location.href = getPostLoginDestination();
        return;
      }

      console.log('Attempting login...');
      const result = normalizeLoginResult(await login(data.username, data.password, data.remember));
      console.log('Login result:', result);
      logger.log(`Login ${result.ok ? 'successful' : 'failed'} for user: ${data.username}`);

      if (!result.ok) {
        console.log('Login failed, setting error state');
        const detail =
          result.message ||
          'Invalid username or password. Please try again.';
        setLoginError(detail);
        toast.error(detail);
      }
    } catch (error) {
      console.error('Login error:', error);
      logger.error(`Login error: ${String(error)}`);
      setLoginError('An error occurred during login. Please try again.');
      toast.error('Login failed. Please try again.');
    } finally {
      console.log('Login attempt completed');
      setIsLoading(false);
    }
  };

  const onResetSubmit = async (data: ResetPasswordValues) => {
    logger.log(`Password reset attempt for user: ${data.username}`);
    setIsResetting(true);
    setResetError(null);
    try {
      if (authBackend === 'supabase') {
        const success = await requestPasswordResetEmail(data.username);
        if (success) {
          setShowResetDialog(false);
        } else {
          setResetError('Could not send reset email. Check the address and try again.');
        }
        return;
      }
      const success = await resetPassword(
        data.username,
        data.securityAnswer ?? "",
        data.newPassword ?? "",
      );
      if (success) {
        logger.log(`Password reset successful for user: ${data.username}`);
        setShowResetDialog(false);
        toast.success('Password has been reset successfully. Please log in with your new password.');
      } else {
        logger.log(`Password reset failed for user: ${data.username} - Incorrect security answer`);
        setResetError('Incorrect security answer. Please try again.');
        toast.error('Incorrect security answer');
      }
    } catch (error) {
      logger.error(`Password reset error: ${String(error)}`);
      setResetError('An error occurred while resetting password. Please try again.');
      toast.error('Password reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  const submitLogin = handleSubmit(onSubmit);

  return (
    <div className="relative min-h-[400px] p-6 bg-card/70 backdrop-blur-sm border border-border/60 rounded-lg shadow-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitLogin();
        }}
        className="space-y-6"
      >
        <div className="flex items-center justify-center gap-3">
          {brandLogo ? <img src={brandLogo} alt="App logo" className="h-10 w-auto" /> : null}
          <h2 className="text-lg font-semibold">{branding.appName || 'TEd_trackIT'}</h2>
        </div>
        {loginError && (
          <div className="p-4 mb-4 text-sm border rounded-md bg-destructive/10 text-destructive border-destructive flex items-center space-x-2">
            <div>
              <p className="font-medium">Login Failed</p>
              <p>{loginError}</p>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">
            {authBackend === 'supabase' ? 'Email' : 'Username'}
          </Label>
          <Input
            id="username"
            type={authBackend === 'supabase' ? 'email' : 'text'}
            placeholder={authBackend === 'supabase' ? 'you@company.com' : 'Enter your username'}
            {...register('username')}
            disabled={isLoading}
            className={`h-10 ${loginError ? 'border-destructive' : ''}`}
          />
          {errors.username && (
            <p className="text-sm font-medium text-destructive mt-1">{errors.username.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Enter your password"
              {...register('password')}
              disabled={isLoading}
              className={`h-10 pr-10 ${loginError ? 'border-destructive' : ''}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setIsPasswordVisible((value) => !value)}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              title={isPasswordVisible ? 'Hide password' : 'Show password'}
              disabled={isLoading}
            >
              {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {errors.password && (
            <p className="text-sm font-medium text-destructive mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox id="remember" {...register('remember')} disabled={isLoading} />
            <Label htmlFor="remember" className="text-sm flex items-center">
              Remember me
            </Label>
          </div>
          <Button
            type="button"
            variant="link"
            className="text-sm"
            onClick={() => {
              setShowResetDialog(true);
              setResetError(null);
            }}
            disabled={isLoading}
          >
            Forgot password?
          </Button>
        </div>

        <Button 
          type="button" 
          className="w-full h-10" 
          disabled={isLoading}
          variant={loginError ? "destructive" : "default"}
          onClick={() => {
            void submitLogin();
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Logging in...
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              {loginError ? 'Try Again' : 'Log In'}
            </>
          )}
        </Button>

        {authBackend === 'supabase' ? (
          <div className="rounded-md border border-border/50 bg-muted/15 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Email magic link</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              disabled={magicBusy || isLoading}
              onClick={() => void sendMagicLink()}
            >
              {magicBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send sign-in link
                </>
              )}
            </Button>
          </div>
        ) : null}
      </form>

      <p className="mt-3 text-center text-xs text-muted-foreground leading-snug">
        {authBackend === 'supabase'
          ? 'Cloud sign-in (Supabase). Use the email and password from Authentication → Users for this project.'
          : `Local sign-in only: this bundle was built without valid Supabase env vars. Cloud accounts will not work until you redeploy with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. (debug: rawUrlPresent=${supabaseConfigDiagnostics.rawUrlPresent ? 'yes' : 'no'}, normalizedUrl=${supabaseConfigDiagnostics.normalizedUrl ?? 'invalid'}, anonKeyPresent=${supabaseConfigDiagnostics.anonKeyPresent ? 'yes' : 'no'})`}
      </p>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DraggableDialogContent className="w-[min(calc(100vw-1rem),480px)]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              {authBackend === 'supabase'
                ? 'Enter your account email. We will send a link to set a new password.'
                : 'Enter your username and security answer to reset your password.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetSubmit(onResetSubmit)} className="space-y-4">
            {resetError && (
              <div className="p-4 text-sm border rounded-md bg-destructive/10 text-destructive border-destructive flex items-center space-x-2">
                <div className="w-1 h-full bg-destructive rounded-full" />
                <div>
                  <p className="font-medium">Reset Failed</p>
                  <p>{resetError}</p>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="reset-username">{authBackend === 'supabase' ? 'Email' : 'Username'}</Label>
              <Input
                id="reset-username"
                type={authBackend === 'supabase' ? 'email' : 'text'}
                placeholder={authBackend === 'supabase' ? 'you@company.com' : 'Enter your username'}
                {...registerReset('username')}
                disabled={isResetting}
              />
              {resetErrors.username && (
                <p className="text-sm font-medium text-destructive">{resetErrors.username.message}</p>
              )}
            </div>

            {authBackend === 'local' && securityQuestion && (
              <div className="space-y-2">
                <Label>Security Question</Label>
                <p className="text-sm text-muted-foreground">{securityQuestion}</p>
              </div>
            )}

            {authBackend === 'local' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="security-answer">Security Answer</Label>
                  <Input
                    id="security-answer"
                    type="text"
                    placeholder="Enter your security answer"
                    {...registerReset('securityAnswer')}
                    disabled={isResetting}
                    className={resetError ? 'border-destructive' : ''}
                  />
                  {resetErrors.securityAnswer && (
                    <p className="text-sm font-medium text-destructive">{resetErrors.securityAnswer.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={isResetPasswordVisible ? 'text' : 'password'}
                      placeholder="Enter new password (minimum 4 characters)"
                      {...registerReset('newPassword')}
                      disabled={isResetting}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsResetPasswordVisible((value) => !value)}
                      aria-label={isResetPasswordVisible ? 'Hide password' : 'Show password'}
                      title={isResetPasswordVisible ? 'Hide password' : 'Show password'}
                      disabled={isResetting}
                    >
                      {isResetPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {resetErrors.newPassword && (
                    <p className="text-sm font-medium text-destructive">{resetErrors.newPassword.message}</p>
                  )}
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetDialog(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isResetting}>
                {isResetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {authBackend === 'supabase' ? 'Sending…' : 'Resetting...'}
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    {authBackend === 'supabase' ? 'Send reset link' : 'Reset Password'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DraggableDialogContent>
      </Dialog>
    </div>
  );
}
