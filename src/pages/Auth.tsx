import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import peoriaSkyline from "@/assets/peoria-skyline.jpg";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  
  // Password reset flow state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatePasswordLoading, setUpdatePasswordLoading] = useState(false);

  useEffect(() => {
    const isResetFlow = searchParams.get('reset') === 'true';
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // If this is a password reset flow, show the reset form instead of redirecting
        if (isResetFlow) {
          setIsResettingPassword(true);
        } else {
          const redirectPath = sessionStorage.getItem('redirectAfterAuth');
          if (redirectPath) {
            sessionStorage.removeItem('redirectAfterAuth');
            navigate(redirectPath);
          } else {
            navigate("/");
          }
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // If this is a password reset flow, show the reset form instead of redirecting
        if (isResetFlow) {
          setIsResettingPassword(true);
        } else {
          const redirectPath = sessionStorage.getItem('redirectAfterAuth');
          if (redirectPath) {
            sessionStorage.removeItem('redirectAfterAuth');
            navigate(redirectPath);
          } else {
            navigate("/");
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || undefined,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Account created successfully. You can now log in.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.user.id)
          .maybeSingle();
        
        if (profile && !profile.is_active) {
          await supabase.auth.signOut();
          toast({
            title: "Account Inactive",
            description: "Your account has been deactivated. Please contact an administrator.",
            variant: "destructive",
          });
          return;
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotPasswordEmail.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/auth?reset=true`,
        }
      );

      if (error) throw error;

      toast({
        title: "Check Your Email",
        description: "If this email is registered, you'll receive a password reset link.",
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    
    setUpdatePasswordLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (error) throw error;
      
      toast({
        title: "Password Updated!",
        description: "Your password has been changed successfully.",
      });
      
      // Clear the reset state and redirect
      setIsResettingPassword(false);
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatePasswordLoading(false);
    }
  };

  // Show password update form if user clicked reset link
  if (isResettingPassword) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <img 
          src={peoriaSkyline} 
          alt="Peoria Illinois Skyline"
          className="absolute inset-0 w-full h-full object-cover hidden sm:block"
        />
        <img 
          src={peoriaBridgeMobile} 
          alt="I-74 Bridge Peoria Illinois"
          className="absolute inset-0 w-full h-full object-cover sm:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/40" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-amber-300/50">
              <span className="text-black text-3xl sm:text-4xl">♠</span>
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Peoria Poker League
              </h1>
              <p className="text-amber-200/70 text-xs sm:text-sm">Set your new password</p>
            </div>
          </div>
          
          <Card className="w-full max-w-md bg-slate-900/90 border-2 border-amber-600/40 shadow-2xl shadow-black/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-amber-100 flex items-center gap-2">
                <span className="text-amber-400">🔑</span>
                Set New Password
              </CardTitle>
              <CardDescription className="text-amber-200/60">
                Enter your new password below
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-amber-200/80">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-amber-200/80">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30" 
                  disabled={updatePasswordLoading}
                >
                  {updatePasswordLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <div className="mt-6 flex items-center gap-2 text-amber-400/40">
            <span>♠</span>
            <span>♥</span>
            <span>♦</span>
            <span>♣</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Images */}
      <img 
        src={peoriaSkyline} 
        alt="Peoria Illinois Skyline"
        className="absolute inset-0 w-full h-full object-cover hidden sm:block"
      />
      <img 
        src={peoriaBridgeMobile} 
        alt="I-74 Bridge Peoria Illinois"
        className="absolute inset-0 w-full h-full object-cover sm:hidden"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/40" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Logo Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-amber-300/50">
            <span className="text-black text-3xl sm:text-4xl">♠</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Peoria Poker League
            </h1>
            <p className="text-amber-200/70 text-xs sm:text-sm">Sign in to play</p>
          </div>
        </div>
        
        {/* Auth Card */}
        <Card className="w-full max-w-md bg-slate-900/90 border-2 border-amber-600/40 shadow-2xl shadow-black/50 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-amber-100 flex items-center gap-2">
              <span className="text-amber-400">♦</span>
              Welcome
            </CardTitle>
            <CardDescription className="text-amber-200/60">
              Sign in or create an account to join the table
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 border border-amber-700/30">
                <TabsTrigger 
                  value="login"
                  className="text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-amber-600/20 data-[state=active]:text-amber-400 data-[state=active]:border-b-2 data-[state=active]:border-amber-500"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-amber-600/20 data-[state=active]:text-amber-400 data-[state=active]:border-b-2 data-[state=active]:border-amber-500"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-amber-200/80">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-amber-200/80">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30" 
                    disabled={loading}
                  >
                    {loading ? "Loading..." : "Login"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="w-full text-sm text-amber-400/70 hover:text-amber-400 transition-colors underline underline-offset-2"
                  >
                    Forgot your password?
                  </button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="text-amber-200/80">Username (optional)</Label>
                    <Input
                      id="signup-username"
                      type="text"
                      placeholder="PokerPro123"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-amber-200/80">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-amber-200/80">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30" 
                    disabled={loading}
                  >
                    {loading ? "Creating Account..." : "Sign Up"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        
        {/* Footer decoration */}
        <div className="mt-6 flex items-center gap-2 text-amber-400/40">
          <span>♠</span>
          <span>♥</span>
          <span>♦</span>
          <span>♣</span>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="bg-slate-900 border-2 border-amber-600/40">
          <DialogHeader>
            <DialogTitle className="text-amber-100 flex items-center gap-2">
              <span className="text-amber-400">🔑</span>
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-amber-200/60">
              Enter your email address and we'll send you a reset link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email" className="text-amber-200/80">Email Address</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                required
                className="bg-slate-800/50 border-amber-700/30 text-white placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-500/20"
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForgotPassword(false)}
                className="flex-1 border-amber-700/30 text-amber-200 hover:bg-amber-700/20"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold" 
                disabled={forgotPasswordLoading}
              >
                {forgotPasswordLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
