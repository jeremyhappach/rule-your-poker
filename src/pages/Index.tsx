import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl font-bold">Three, Five, Seven</h1>
        <p className="text-xl text-muted-foreground">
          Welcome, {user.email}
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg">Create Game</Button>
          <Button size="lg" variant="outline">Join Game</Button>
          <Button variant="ghost" onClick={handleLogout}>Logout</Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
