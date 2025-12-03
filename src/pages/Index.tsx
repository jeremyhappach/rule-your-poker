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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, Trash2, ShieldAlert } from "lucide-react";
import { VisualPreferences } from "@/components/VisualPreferences";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchUsername(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchUsername(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
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
    await supabase.auth.signOut();
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

  if (!user) return null;

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <h1 className="text-2xl sm:text-4xl font-bold">Peoria Home Game Poker</h1>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowProfileDialog(true)}
              className="w-full sm:w-auto"
            >
              <UserCircle className="w-4 h-4 mr-2" />
              Profile
            </Button>
            <Button variant="ghost" onClick={handleLogout} className="w-full sm:w-auto">
              Logout
            </Button>
          </div>
        </div>
        <GameLobby userId={user.id} />
      </div>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>
              Update your profile, password, or visual preferences
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
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

              {/* Visual Preferences Section */}
              {user && <VisualPreferences userId={user.id} />}

              {/* Superuser Admin Section */}
              {isSuperuser && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <h3 className="font-semibold text-destructive">Admin Controls</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
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
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
