-- Fix cribbage_events atomic dedupe key so frontend UPSERT onConflict matches a real unique constraint.
-- Root cause: unique index used COALESCE(event_subtype,'') expression, which cannot be targeted by supabase-js onConflict.
-- Solution: make event_subtype NOT NULL with default '' and use a plain unique index on columns.

begin;

-- Normalize legacy rows so we can enforce NOT NULL.
update public.cribbage_events
set event_subtype = ''
where event_subtype is null;

-- Enforce non-null subtype to keep dedupe semantics for events that previously used NULL.
alter table public.cribbage_events
  alter column event_subtype set default '',
  alter column event_subtype set not null;

-- Replace expression-based unique index with a plain-column unique index.
drop index if exists public.idx_cribbage_events_unique_event;
create unique index idx_cribbage_events_unique_event
  on public.cribbage_events (round_id, hand_number, event_type, event_subtype, player_id, sequence_number);

commit;