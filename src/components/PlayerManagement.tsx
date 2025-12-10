import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ShieldCheck, ShieldX, UserCheck, UserX } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
}

interface PlayerManagementProps {
  currentUserId: string;
}

export const PlayerManagement = ({ currentUserId }: PlayerManagementProps) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, is_active, is_superuser')
      .order('username');

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    setProfiles(data || []);
    setLoading(false);
  };

  const toggleActive = async (profileId: string, currentValue: boolean) => {
    if (profileId === currentUserId) return; // Can't deactivate yourself
    
    setUpdating(profileId);
    
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentValue })
      .eq('id', profileId);

    if (error) {
      console.error('Error updating is_active:', error);
    } else {
      setProfiles(prev => prev.map(p => 
        p.id === profileId ? { ...p, is_active: !currentValue } : p
      ));
    }
    
    setUpdating(null);
  };

  const toggleSuperuser = async (profileId: string, currentValue: boolean) => {
    if (profileId === currentUserId) return; // Can't remove your own superuser status
    
    setUpdating(profileId);
    
    const { error } = await supabase
      .from('profiles')
      .update({ is_superuser: !currentValue })
      .eq('id', profileId);

    if (error) {
      console.error('Error updating is_superuser:', error);
    } else {
      setProfiles(prev => prev.map(p => 
        p.id === profileId ? { ...p, is_superuser: !currentValue } : p
      ));
    }
    
    setUpdating(null);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading players...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Users className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">Player Management</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage player access and admin privileges
      </p>
      
      <ScrollArea className="h-[200px] rounded-md border p-3">
        <div className="space-y-3">
          {profiles.map((profile) => {
            const isCurrentUser = profile.id === currentUserId;
            const isUpdatingThis = updating === profile.id;
            
            return (
              <div 
                key={profile.id} 
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                  isCurrentUser ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {profile.username}
                  </span>
                  {isCurrentUser && (
                    <span className="text-xs text-amber-500">(you)</span>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Active Toggle */}
                  <div className="flex items-center gap-2">
                    <Label 
                      htmlFor={`active-${profile.id}`} 
                      className="text-xs text-muted-foreground flex items-center gap-1"
                    >
                      {profile.is_active ? (
                        <UserCheck className="h-3 w-3 text-green-500" />
                      ) : (
                        <UserX className="h-3 w-3 text-red-500" />
                      )}
                      Active
                    </Label>
                    <Switch
                      id={`active-${profile.id}`}
                      checked={profile.is_active}
                      onCheckedChange={() => toggleActive(profile.id, profile.is_active)}
                      disabled={isCurrentUser || isUpdatingThis}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </div>
                  
                  {/* Superuser Toggle */}
                  <div className="flex items-center gap-2">
                    <Label 
                      htmlFor={`superuser-${profile.id}`} 
                      className="text-xs text-muted-foreground flex items-center gap-1"
                    >
                      {profile.is_superuser ? (
                        <ShieldCheck className="h-3 w-3 text-amber-500" />
                      ) : (
                        <ShieldX className="h-3 w-3 text-muted-foreground" />
                      )}
                      Admin
                    </Label>
                    <Switch
                      id={`superuser-${profile.id}`}
                      checked={profile.is_superuser}
                      onCheckedChange={() => toggleSuperuser(profile.id, profile.is_superuser)}
                      disabled={isCurrentUser || isUpdatingThis}
                      className="data-[state=checked]:bg-amber-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
