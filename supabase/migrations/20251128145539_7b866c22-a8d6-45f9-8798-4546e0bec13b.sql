-- Enable realtime for profiles table so joined queries update properly
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;