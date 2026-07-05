
-- Seed synthetic incident #1 — waiting_table
WITH ins AS (
  INSERT INTO public.client_runtime_incidents (
    correlation_id, incident_type, kind, severity, status,
    started_at, detected_at, resolved_at,
    client_instance_id, tab_session_id, user_id, route, origin,
    last_event_at, last_route, last_voice_phase, last_lifecycle_event,
    payload, summary, root_cause_status
  ) VALUES (
    'proof-surface-waiting-1', 'voice_capture','voice_capture','info','closed',
    now()-interval '20 seconds', now()-interval '20 seconds', now(),
    'synth-ci-wait','synth-tab-wait', null, '/lobby','https://ptown-poker.lovable.app',
    now(), '/lobby','VOICE_SEND_COMPLETE','VOICE_SEND_COMPLETE',
    jsonb_build_object(
      'voice_surface','waiting_table',
      'shell_phase','lobby-idle',
      'active_game_component',null,
      'waiting_table_component','WaitingForPlayersTable',
      'modal_blocking_state','none'
    ),
    'synthetic waiting_table proof','voice-send-completed'
  ) RETURNING correlation_id
)
INSERT INTO public.client_runtime_events (
  occurred_at_client, client_instance_id, tab_session_id, user_id,
  correlation_id, event_family, event_name, severity, route, payload
)
SELECT * FROM (VALUES
  (now()-interval '20 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_CAPTURE_START','info','/lobby', jsonb_build_object('__voice_surface_context', jsonb_build_object('voice_surface','waiting_table','shell_phase','lobby-idle','waiting_table_component','WaitingForPlayersTable'))),
  (now()-interval '19 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','environment','CAPSULE_LOCAL_APPEND_VERIFIED','info','/lobby', jsonb_build_object('forEventName','VOICE_CAPTURE_START','monotonicSequence',1)),
  (now()-interval '19 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','environment','CAPSULE_MANIFEST_UPDATED','info','/lobby', jsonb_build_object('sequence',1)),
  (now()-interval '19 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','environment','INCIDENT_PATCH_VERIFIED','info','/lobby', jsonb_build_object('sequence',1)),
  (now()-interval '19 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','environment','INSTANCE_HEARTBEAT_VERIFIED','info','/lobby', jsonb_build_object('lifecycleLabel','VOICE_CAPTURE_START')),
  (now()-interval '15 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_BLOB_READY','info','/lobby', jsonb_build_object()),
  (now()-interval '14 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_FN_INVOKE_START','info','/lobby', jsonb_build_object()),
  (now()-interval '13 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_FN_INVOKE_RESPONSE','info','/lobby', jsonb_build_object()),
  (now()-interval '12 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_SEND_BEGIN','info','/lobby', jsonb_build_object()),
  (now()-interval '11 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','voice','VOICE_SEND_COMPLETE','info','/lobby', jsonb_build_object()),
  (now()-interval '10 seconds','synth-ci-wait','synth-tab-wait',null::uuid,'proof-surface-waiting-1','environment','CAPSULE_UPLOAD_COMPLETED','info','/lobby', jsonb_build_object())
) AS t;

-- Seed synthetic incident #2 — active_game_table
INSERT INTO public.client_runtime_incidents (
  correlation_id, incident_type, kind, severity, status,
  started_at, detected_at, resolved_at,
  client_instance_id, tab_session_id, user_id, route, origin,
  last_event_at, last_route, last_voice_phase, last_lifecycle_event,
  payload, summary, root_cause_status
) VALUES (
  'proof-surface-active-1', 'voice_capture','voice_capture','info','closed',
  now()-interval '20 seconds', now()-interval '20 seconds', now(),
  'synth-ci-active','synth-tab-active', null, '/game/ae68fddf','https://ptown-poker.lovable.app',
  now(), '/game/ae68fddf','VOICE_SEND_COMPLETE','VOICE_SEND_COMPLETE',
  jsonb_build_object(
    'voice_surface','active_game_table',
    'shell_phase','in-hand',
    'active_game_component','HolmFeltContent',
    'waiting_table_component',null,
    'modal_blocking_state','none'
  ),
  'synthetic active_game_table proof','voice-send-completed'
);

INSERT INTO public.client_runtime_events (
  occurred_at_client, client_instance_id, tab_session_id, user_id,
  correlation_id, event_family, event_name, severity, route, payload
)
SELECT * FROM (VALUES
  (now()-interval '20 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_CAPTURE_START','info','/game/ae68fddf', jsonb_build_object('__voice_surface_context', jsonb_build_object('voice_surface','active_game_table','shell_phase','in-hand','active_game_component','HolmFeltContent'))),
  (now()-interval '19 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','environment','CAPSULE_LOCAL_APPEND_VERIFIED','info','/game/ae68fddf', jsonb_build_object('forEventName','VOICE_CAPTURE_START','monotonicSequence',1)),
  (now()-interval '19 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','environment','CAPSULE_MANIFEST_UPDATED','info','/game/ae68fddf', jsonb_build_object('sequence',1)),
  (now()-interval '19 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','environment','INCIDENT_PATCH_VERIFIED','info','/game/ae68fddf', jsonb_build_object('sequence',1)),
  (now()-interval '19 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','environment','INSTANCE_HEARTBEAT_VERIFIED','info','/game/ae68fddf', jsonb_build_object('lifecycleLabel','VOICE_CAPTURE_START')),
  (now()-interval '15 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_BLOB_READY','info','/game/ae68fddf', jsonb_build_object()),
  (now()-interval '14 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_FN_INVOKE_START','info','/game/ae68fddf', jsonb_build_object()),
  (now()-interval '13 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_FN_INVOKE_RESPONSE','info','/game/ae68fddf', jsonb_build_object()),
  (now()-interval '12 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_SEND_BEGIN','info','/game/ae68fddf', jsonb_build_object()),
  (now()-interval '11 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','voice','VOICE_SEND_COMPLETE','info','/game/ae68fddf', jsonb_build_object()),
  (now()-interval '10 seconds','synth-ci-active','synth-tab-active',null::uuid,'proof-surface-active-1','environment','CAPSULE_UPLOAD_COMPLETED','info','/game/ae68fddf', jsonb_build_object())
) AS t;
