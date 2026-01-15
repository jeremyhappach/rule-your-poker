import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Profile {
  id: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  last_seen_at: string | null;
  email: string | null;
}

interface PlayerManagementProps {
  currentUserId: string;
}

export const PlayerManagement = ({ currentUserId }: PlayerManagementProps) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, is_active, is_superuser, created_at, last_seen_at, email')
      .not('username', 'ilike', 'Bot %')
      .order('username');

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    setProfiles(data || []);
    setLoading(false);
  };

  const toggleActive = async (profileId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profileId === currentUserId) return;
    
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

  const toggleSuperuser = async (profileId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profileId === currentUserId) return;
    
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

  const toggleExpanded = (profileId: string) => {
    setExpandedId(prev => prev === profileId ? null : profileId);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading players...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="pb-1 border-b">
        <h3 className="font-semibold text-sm">Players</h3>
      </div>
      
      <ScrollArea className="h-[180px] rounded-md border p-2">
        <div className="space-y-1">
          {profiles.map((profile) => {
            const isCurrentUser = profile.id === currentUserId;
            const isUpdatingThis = updating === profile.id;
            const isExpanded = expandedId === profile.id;
            
            return (
              <div key={profile.id} className="space-y-0">
                <div 
                  onClick={() => toggleExpanded(profile.id)}
                  className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer transition-colors ${
                    isCurrentUser ? 'bg-amber-500/10' : 'bg-muted/20 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs truncate max-w-[100px]">
                      {profile.username}
                      {isCurrentUser && <span className="text-amber-500 ml-1">•</span>}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Active</span>
                      <Switch
                        checked={profile.is_active}
                        onCheckedChange={() => {}}
                        onClick={(e) => toggleActive(profile.id, profile.is_active, e)}
                        disabled={isCurrentUser || isUpdatingThis}
                        className="scale-75 data-[state=checked]:bg-green-600"
                      />
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Admin</span>
                      <Switch
                        checked={profile.is_superuser}
                        onCheckedChange={() => {}}
                        onClick={(e) => toggleSuperuser(profile.id, profile.is_superuser, e)}
                        disabled={isCurrentUser || isUpdatingThis}
                        className="scale-75 data-[state=checked]:bg-amber-600"
                      />
                    </div>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="ml-4 pl-3 py-2 border-l-2 border-muted space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Email:</span>
                      <span className="text-foreground">{profile.email || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Joined:</span>
                      <span className="text-foreground">{formatDate(profile.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last seen:</span>
                      <span className="text-foreground">{formatDate(profile.last_seen_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
