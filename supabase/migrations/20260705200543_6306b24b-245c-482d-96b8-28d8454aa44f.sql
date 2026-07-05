ALTER TABLE public.chat_send_operations
  DROP CONSTRAINT IF EXISTS chat_send_operations_sender_user_id_fkey;

ALTER TABLE public.chat_operation_reports
  DROP CONSTRAINT IF EXISTS chat_operation_reports_sender_user_id_fkey;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS chat_operation_id text;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_chat_operation_id_fkey
  FOREIGN KEY (chat_operation_id)
  REFERENCES public.chat_send_operations(operation_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_chat_operation_id_idx
ON public.chat_messages (chat_operation_id);
