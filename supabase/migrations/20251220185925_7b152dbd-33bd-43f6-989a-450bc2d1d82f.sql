-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true);

-- Allow authenticated users to upload chat images
CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'chat-images' AND auth.uid() IS NOT NULL);

-- Allow anyone to view chat images
CREATE POLICY "Anyone can view chat images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-images');

-- Allow users to delete their own chat images
CREATE POLICY "Users can delete own chat images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add image_url column to chat_messages table
ALTER TABLE public.chat_messages
ADD COLUMN image_url TEXT DEFAULT NULL;