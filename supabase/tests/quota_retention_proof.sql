-- Rollback-only contract proof for the quota-retention predicates. This uses
-- temporary rows only; production gameplay and diagnostic rows are untouched.
BEGIN;

CREATE TEMP TABLE quota_debug_probe(
  id integer PRIMARY KEY,
  created_at timestamptz NOT NULL
);
CREATE TEMP TABLE quota_cron_probe(
  id integer PRIMARY KEY,
  status text,
  start_time timestamptz,
  end_time timestamptz
);
CREATE TEMP TABLE quota_chat_messages_probe(chat_operation_id text);
CREATE TEMP TABLE quota_chat_operations_probe(
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL
);

INSERT INTO quota_debug_probe VALUES
  (1, clock_timestamp() - interval '2 days'),
  (2, clock_timestamp() - interval '12 hours');
INSERT INTO quota_cron_probe VALUES
  (1, 'succeeded', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
  (2, 'succeeded', clock_timestamp() - interval '12 hours', clock_timestamp() - interval '12 hours'),
  (3, 'failed', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
  (4, 'failed', clock_timestamp() - interval '8 days', clock_timestamp() - interval '8 days'),
  (5, 'running', clock_timestamp() - interval '8 days', NULL);
INSERT INTO quota_chat_operations_probe VALUES
  ('00000000-0000-0000-0000-000000000001', clock_timestamp() - interval '2 days');
INSERT INTO quota_chat_messages_probe VALUES
  ('00000000-0000-0000-0000-000000000001');

DELETE FROM quota_debug_probe
 WHERE created_at < clock_timestamp() - interval '1 day';
DELETE FROM quota_cron_probe
 WHERE status = 'succeeded'
   AND coalesce(end_time, start_time) < clock_timestamp() - interval '1 day';
DELETE FROM quota_cron_probe
 WHERE status IS DISTINCT FROM 'succeeded'
   AND status IS DISTINCT FROM 'running'
   AND coalesce(end_time, start_time) < clock_timestamp() - interval '7 days';
UPDATE quota_chat_messages_probe m
   SET chat_operation_id = NULL
  FROM quota_chat_operations_probe o
 WHERE m.chat_operation_id = o.id::text
   AND o.created_at < clock_timestamp() - interval '1 day';

DO $proof$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM quota_debug_probe) <> ARRAY[2] THEN
    RAISE EXCEPTION 'quota proof: debug retention failed';
  END IF;
  IF (SELECT array_agg(id ORDER BY id) FROM quota_cron_probe) <> ARRAY[2,3,5] THEN
    RAISE EXCEPTION 'quota proof: cron retention failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM quota_chat_messages_probe WHERE chat_operation_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'quota proof: chat text/uuid join failed';
  END IF;
END
$proof$;

ROLLBACK;
