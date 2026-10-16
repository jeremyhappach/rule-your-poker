// Loopback-only Storage policy fixture; production Storage uses the installed migration.
export async function installArtworkStorage(db){await db.query(`CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text UNIQUE,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage,public,auth TO anon,authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
 GRANT SELECT ON public.profiles TO authenticated;
 CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$SELECT public.has_role(_user_id,'admin'::public.app_role)$$;
 CREATE POLICY chat_read ON storage.objects FOR SELECT USING(bucket_id='chat-images');
 CREATE POLICY chat_upload ON storage.objects FOR INSERT WITH CHECK(bucket_id='chat-images' AND auth.uid() IS NOT NULL);
 CREATE POLICY cutover_write_lock_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(NOT public.cutover_write_lock_active());
 CREATE POLICY cutover_write_lock_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(NOT public.cutover_write_lock_active());
 CREATE POLICY cutover_write_lock_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(NOT public.cutover_write_lock_active());
`);}
