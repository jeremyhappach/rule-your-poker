import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { GameLobby } from "@/components/GameLobby";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, Trash2, ShieldAlert, History, Wrench, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisualPreferences } from "@/components/VisualPreferences";
import { PlayerManagement } from "@/components/PlayerManagement";
import { MyGameHistory } from "@/components/MyGameHistory";
import { GameRules } from "@/components/GameRules";
import { CustomGameNamesManager } from "@/components/CustomGameNamesManager";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePlayerBalance } from "@/hooks/usePlayerBalance";
import { TransactionHistoryDialog } from "@/components/TransactionHistoryDialog";
import { AdminPlayerListDialog } from "@/components/AdminPlayerListDialog";
import { formatChipValue } from "@/lib/utils";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [allowBotDealers, setAllowBotDealers] = useState(false);
  const [loadingBotDealersSetting, setLoadingBotDealersSetting] = useState(true);
  const { isMaintenanceMode, loading: maintenanceLoading, toggleMaintenanceMode } = useMaintenanceMode();
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
  const { isAdmin } = useIsAdmin(user?.id);
  const { balance, refetch: refetchBalance } = usePlayerBalance(user?.id);
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [showAdminPlayerList, setShowAdminPlayerList] = useState(false);

  // Refetch balance when dialog opens
  const handleBalanceButtonClick = () => {
    refetchBalance();
    if (isAdmin) {
      setShowAdminPlayerList(true);
    } else {
      setShowBalanceDialog(true);
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        if (!session) {
          navigate("/auth");
        } else {
          setUser(session.user);
          fetchUsername(session.user.id);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchUsername(session.user.id);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const fetchUsername = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username, is_superuser')
      .eq('id', userId)
      .single();
    
    if (data) {
      setCurrentUsername(data.username);
      setIsSuperuser(data.is_superuser || false);
      
      // Fetch bot dealers setting if superuser
      if (data.is_superuser) {
        fetchBotDealersSetting();
      }
    }
  };

  const fetchBotDealersSetting = async () => {
    setLoadingBotDealersSetting(true);
    const { data } = await supabase
      .from('game_defaults')
      .select('allow_bot_dealers')
      .eq('game_type', 'holm')
      .single();
    
    if (data) {
      setAllowBotDealers((data as any).allow_bot_dealers ?? false);
    }
    setLoadingBotDealersSetting(false);
  };

  const handleToggleBotDealers = async (enabled: boolean) => {
    setAllowBotDealers(enabled);
    
    // Update both game types
    const { error } = await supabase
      .from('game_defaults')
      .update({ allow_bot_dealers: enabled } as any)
      .in('game_type', ['holm', '3-5-7']);
    
    if (error) {
      console.error('[ADMIN] Error updating bot dealers setting:', error);
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
      setAllowBotDealers(!enabled); // Revert
    } else {
      toast({
        title: "Success",
        description: enabled ? "Bot dealers enabled" : "Bot dealers disabled",
      });
    }
  };

  const handleDeleteAllSessions = async () => {
    if (!isSuperuser) return;
    
    setIsDeleting(true);
    
    try {
      // Delete all player_cards
      await supabase.from('player_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete all player_actions
      await supabase.from('player_actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete all rounds
      await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete all players
      await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete all games
      const { error } = await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "All sessions have been deleted",
      });
      
      // Refresh the page to update the game list
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete sessions",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
    // Always navigate to auth page, even if signOut fails
    navigate("/auth");
  };

  const handleUpdateUsername = async () => {
    if (!user || !newUsername.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid username",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);

    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.trim() })
      .eq('id', user.id);

    setIsUpdating(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update username",
        variant: "destructive",
      });
      return;
    }

    setCurrentUsername(newUsername.trim());
    setNewUsername("");
    toast({
      title: "Success",
      description: "Username updated successfully",
    });
    setShowProfileDialog(false);
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    setIsUpdating(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast({
      title: "Success",
      description: "Password updated successfully",
    });
    setShowProfileDialog(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground text-xl">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to /auth
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          {/* Left-aligned username + balance button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleBalanceButtonClick}
            className="flex-1 min-w-0 h-8 px-3 justify-between"
            title={isAdmin ? "Player Balances" : "My Balance"}
          >
            <span 
              className="truncate"
              style={{
                fontSize: currentUsername.length > 15 ? '0.7rem' : 
                         currentUsername.length > 10 ? '0.8rem' : '0.875rem'
              }}
            >
              {currentUsername}
            </span>
            <span 
              className={`font-bold ml-2 flex-shrink-0 ${
                balance >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              ${formatChipValue(balance)}
            </span>
          </Button>
          
          {/* Right side buttons - Profile, History, Logout */}
          <div className="flex gap-1.5 flex-shrink-0">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowProfileDialog(true)}
              className="h-8 w-8 p-0"
              title="Profile Settings"
            >
              <UserCircle className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowHistoryDialog(true)}
              className="h-8 w-8 p-0"
              title="My History"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={handleLogout} size="sm">
              Logout
            </Button>
          </div>
        </div>
        <GameLobby userId={user.id} />
      </div>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              {isAdmin ? "Manage your profile and admin settings" : "Update your profile, password, or visual preferences"}
            </DialogDescription>
          </DialogHeader>
          
          {isAdmin ? (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile" className="flex items-center gap-1.5">
                  <UserCircle className="h-4 w-4" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="admin" className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  Admin
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile">
                <ScrollArea className="max-h-[55vh] pr-4">
                  <div className="space-y-6 pt-2">
                    {/* Visual Preferences Section */}
                    {user && <VisualPreferences userId={user.id} disabled={false} />}

                    {/* Username Section */}
                    <div className="space-y-3">
                      <div className="pb-2 border-b">
                        <h3 className="font-semibold">Username</h3>
                        <p className="text-sm text-muted-foreground">Current: {currentUsername}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-username">New Username</Label>
                        <Input
                          id="new-username"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="Enter new username"
                          autoFocus={false}
                        />
                      </div>
                      <Button 
                        onClick={handleUpdateUsername} 
                        disabled={isUpdating || !newUsername.trim()}
                        className="w-full"
                      >
                        Update Username
                      </Button>
                    </div>

                    {/* Password Section */}
                    <div className="space-y-3">
                      <div className="pb-2 border-b">
                        <h3 className="font-semibold">Password</h3>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          autoFocus={false}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          autoFocus={false}
                        />
                      </div>
                      <Button 
                        onClick={handleUpdatePassword} 
                        disabled={isUpdating || !newPassword || !confirmPassword}
                        className="w-full"
                      >
                        Update Password
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="admin">
                <ScrollArea className="max-h-[55vh] pr-4">
                  <div className="space-y-4 pt-2">
                    {/* Under Maintenance Toggle */}
                    <div className="flex items-center justify-between py-2 bg-amber-900/20 rounded-lg px-3 border border-amber-600/30">
                      <div className="space-y-0.5">
                        <Label htmlFor="maintenance-mode" className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-amber-500" />
                          Under Maintenance
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Blocks all non-admin users and ends active sessions immediately
                        </p>
                      </div>
                      <Switch
                        id="maintenance-mode"
                        checked={isMaintenanceMode}
                        onCheckedChange={async (enabled) => {
                          setIsTogglingMaintenance(true);
                          const success = await toggleMaintenanceMode(enabled);
                          setIsTogglingMaintenance(false);
                          if (success) {
                            toast({
                              title: enabled ? "Maintenance Mode Enabled" : "Maintenance Mode Disabled",
                              description: enabled ? "All active sessions have been ended" : "Users can now access the app",
                            });
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to toggle maintenance mode",
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={maintenanceLoading || isTogglingMaintenance}
                        className="data-[state=checked]:bg-amber-600"
                      />
                    </div>

                    {/* Allow Bot Dealers Toggle */}
                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="allow-bot-dealers">Allow Bot Dealers</Label>
                        <p className="text-xs text-muted-foreground">
                          When enabled, bots can be dealers and will auto-configure games
                        </p>
                      </div>
                      <Switch
                        id="allow-bot-dealers"
                        checked={allowBotDealers}
                        onCheckedChange={handleToggleBotDealers}
                        disabled={loadingBotDealersSetting}
                      />
                    </div>

                    {/* Custom Game Names */}
                    <CustomGameNamesManager />

                    {/* Player Management */}
                    {user && <PlayerManagement currentUserId={user.id} />}
                    
                    {/* Danger Zone */}
                    <div className="pt-2 border-t border-destructive/30">
                      <p className="text-sm text-muted-foreground mb-3">
                        Danger zone: These actions cannot be undone.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            className="w-full"
                            disabled={isDeleting}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isDeleting ? "Deleting..." : "Delete All Sessions"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete All Sessions?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete ALL active and historical game sessions, 
                              including all player data, rounds, and game history. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteAllSessions}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Yes, Delete All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-6">
                {/* Maintenance Mode Warning for non-admins */}
                {isMaintenanceMode && (
                  <div className="bg-amber-900/40 border border-amber-600/60 rounded-lg p-3 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-200">
                      Profile changes are disabled during maintenance.
                    </p>
                  </div>
                )}

                {/* Visual Preferences Section */}
                {user && <VisualPreferences userId={user.id} disabled={isMaintenanceMode} />}

                {/* Username Section */}
                <div className="space-y-3">
                  <div className="pb-2 border-b">
                    <h3 className="font-semibold">Username</h3>
                    <p className="text-sm text-muted-foreground">Current: {currentUsername}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-username">New Username</Label>
                    <Input
                      id="new-username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter new username"
                      autoFocus={false}
                      disabled={isMaintenanceMode}
                    />
                  </div>
                  <Button 
                    onClick={handleUpdateUsername} 
                    disabled={isUpdating || !newUsername.trim() || isMaintenanceMode}
                    className="w-full"
                  >
                    Update Username
                  </Button>
                </div>

                {/* Password Section */}
                <div className="space-y-3">
                  <div className="pb-2 border-b">
                    <h3 className="font-semibold">Password</h3>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoFocus={false}
                      disabled={isMaintenanceMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      autoFocus={false}
                      disabled={isMaintenanceMode}
                    />
                  </div>
                  <Button 
                    onClick={handleUpdatePassword} 
                    disabled={isUpdating || !newPassword || !confirmPassword || isMaintenanceMode}
                    className="w-full"
                  >
                    Update Password
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {user && (
        <MyGameHistory 
          userId={user.id} 
          open={showHistoryDialog} 
          onOpenChange={setShowHistoryDialog} 
        />
      )}

      <GameRules 
        open={showRulesDialog} 
        onOpenChange={setShowRulesDialog} 
      />

      {/* Transaction History Dialog (for non-admins) */}
      {user && (
        <TransactionHistoryDialog
          open={showBalanceDialog}
          onOpenChange={setShowBalanceDialog}
          profileId={user.id}
          playerName={currentUsername}
          isAdmin={isAdmin}
        />
      )}

      {/* Admin Player List Dialog */}
      <AdminPlayerListDialog
        open={showAdminPlayerList}
        onOpenChange={setShowAdminPlayerList}
      />
    </div>
  );
};

export default Index;
