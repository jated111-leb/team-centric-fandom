import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().trim().email({ message: 'Invalid email address' });
const passwordSchema = z.string().min(8, { message: 'Password must be at least 8 characters' });

type AuthMode = 'login' | 'forgot-password' | 'reset-password';

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use ref to track password recovery state synchronously (avoids race condition)
  const isPasswordRecoveryRef = useRef(false);

  useEffect(() => {
    // Listen for auth changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the password reset link - set ref immediately (synchronous)
        isPasswordRecoveryRef.current = true;
        setMode('reset-password');
        return;
      }
      
      // Don't redirect if we're in password recovery mode (check ref, not state)
      if (session && !isPasswordRecoveryRef.current) {
        checkRoleAndRedirect(session.user.id);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isPasswordRecoveryRef.current) {
        checkRoleAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkRoleAndRedirect = (userId: string) => {
    // Defer Supabase call to avoid auth callback deadlock
    setTimeout(async () => {
      try {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();

        if (roleData?.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error('Error checking role:', error);
        navigate('/');
      }
    }, 0);
  };

  const validateEmail = (value: string): boolean => {
    try {
      emailSchema.parse(value);
      setEmailError('');
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setEmailError(error.errors[0].message);
      }
      return false;
    }
  };

  const validatePassword = (value: string): boolean => {
    try {
      passwordSchema.parse(value);
      setPasswordError('');
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setPasswordError(error.errors[0].message);
      }
      return false;
    }
  };

  const validateNewPassword = (value: string): boolean => {
    try {
      passwordSchema.parse(value);
      setNewPasswordError('');
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setNewPasswordError(error.errors[0].message);
      }
      return false;
    }
  };

  const validateConfirmPassword = (value: string): boolean => {
    if (value !== newPassword) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError('');
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);

    if (!emailValid || !passwordValid) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Login Failed',
            description: 'Invalid email or password',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Welcome Back',
        description: 'Successfully logged in',
      });

      // Navigation handled by onAuthStateChange
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred during login',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Reset Email Sent',
        description: 'Check your email for a password reset link',
      });

      setMode('login');
      setEmail('');
    } catch (error) {
      console.error('Password reset error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send reset email. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const newPasswordValid = validateNewPassword(newPassword);
    const confirmPasswordValid = validateConfirmPassword(confirmPassword);

    if (!newPasswordValid || !confirmPasswordValid) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Password Updated',
        description: 'Your password has been successfully changed. Please log in with your new password.',
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      isPasswordRecoveryRef.current = false;
      setMode('login');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Password update error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update password. The link may have expired. Please request a new reset link.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'reset-password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (e.target.value) {
                      validateNewPassword(e.target.value);
                    } else {
                      setNewPasswordError('');
                    }
                    // Re-validate confirm if it has a value
                    if (confirmPassword) {
                      validateConfirmPassword(confirmPassword);
                    }
                  }}
                  disabled={loading}
                  className={newPasswordError ? 'border-destructive' : ''}
                />
                {newPasswordError && (
                  <p className="text-xs text-destructive">{newPasswordError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (e.target.value) {
                      validateConfirmPassword(e.target.value);
                    } else {
                      setConfirmPasswordError('');
                    }
                  }}
                  disabled={loading}
                  className={confirmPasswordError ? 'border-destructive' : ''}
                />
                {confirmPasswordError && (
                  <p className="text-xs text-destructive">{confirmPasswordError}</p>
                )}
                {confirmPassword && !confirmPasswordError && newPassword === confirmPassword && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Passwords match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !newPassword || !confirmPassword || !!newPasswordError || !!confirmPasswordError}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>

            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => {
                isPasswordRecoveryRef.current = false;
                setMode('login');
                setNewPassword('');
                setConfirmPassword('');
                setNewPasswordError('');
                setConfirmPasswordError('');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'forgot-password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription>
              Enter your email to receive a password reset link
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (e.target.value.trim()) {
                      validateEmail(e.target.value);
                    } else {
                      setEmailError('');
                    }
                  }}
                  disabled={loading}
                  className={emailError ? 'border-destructive' : ''}
                />
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email || !!emailError}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>

            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => {
                setMode('login');
                setEmailError('');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Admin Login</CardTitle>
          <CardDescription>
            Enter your credentials to access the admin panel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (e.target.value.trim()) {
                    validateEmail(e.target.value);
                  } else {
                    setEmailError('');
                  }
                }}
                disabled={loading}
                className={emailError ? 'border-destructive' : ''}
              />
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (e.target.value) {
                    validatePassword(e.target.value);
                  } else {
                    setPasswordError('');
                  }
                }}
                disabled={loading}
                className={passwordError ? 'border-destructive' : ''}
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email || !password || !!emailError || !!passwordError}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <Button
              variant="link"
              className="text-sm text-muted-foreground"
              onClick={() => {
                setMode('forgot-password');
                setPassword('');
                setPasswordError('');
              }}
            >
              Forgot your password?
            </Button>
            <p className="text-xs text-muted-foreground">
              For security, please change your password after first login
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
