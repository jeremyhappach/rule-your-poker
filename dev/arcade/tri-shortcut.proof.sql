BEGIN;
SET LOCAL statement_timeout='8s';
DO $$
DECLARE a uuid:=gen_random_uuid();other uuid:=gen_random_uuid();r jsonb;v jsonb;old jsonb;run_id uuid;request uuid:=gen_random_uuid();revision bigint;round_id text;at_ms bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(other);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Shortcut rollback proof',true),(other,'Shortcut foreign proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 r:=public.arcade_start(a,gen_random_uuid(),'tri-towers');run_id:=(r->>'id')::uuid;
 r:=public.arcade_tri_step(a,run_id);ASSERT r#>>'{record,ruleset}'='tri-towers/3','frozen current version';
 BEGIN PERFORM public.arcade_tri_step(other,run_id);RAISE EXCEPTION 'foreign admitted';EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='arcade:not_found';END;
 UPDATE public.profiles SET is_active=false WHERE id=a;
 BEGIN PERFORM public.arcade_tri_step(a,run_id);RAISE EXCEPTION 'inactive admitted';EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='arcade:forbidden';END;
 UPDATE public.profiles SET is_active=true WHERE id=a;
 revision:=(r#>>'{record,revision}')::bigint;round_id:=r#>>'{record,state,roundId}';
 BEGIN PERFORM public.arcade_tri_step(a,run_id,revision,round_id,request,'draw');RAISE EXCEPTION 'intro admitted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM IN('arcade:round_intro','tri_towers:round_intro','tri_towers:phase');END;
 -- Only this transaction's synthetic run is moved to Ready for the boundary proof.
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{board,phase}','"ready"'),'{board,deadline}',to_jsonb(at_ms+30000)),due_at=at_ms+30000 WHERE private.arcade_runs.id=run_id;
 old:=public.arcade_load(a,run_id);revision:=(old->>'revision')::bigint;
 BEGIN PERFORM public.arcade_tri_step(a,run_id,revision,round_id,request,'remove',0);RAISE EXCEPTION 'hidden admitted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='tri_towers:illegal_move';END;
 ASSERT (public.arcade_load(a,run_id)->'state')=(old->'state'),'invalid action preserves Ready';
 v:=public.arcade_tri_step(a,run_id,revision,round_id,request,'draw');
 ASSERT v->>'outcome'='committed','direct step accepted';
 ASSERT (v#>>'{record,state,board,deadline}')::bigint-(v#>>'{projection,serverAt}')::bigint=120000,'full playing clock';
 ASSERT NOT (v->'projection') ? 'deck' AND v#>'{projection,view,cards,0}'='null'::jsonb,'redacted projection';
 ASSERT public.arcade_tri_step(a,run_id,revision,round_id,request,'draw')->>'outcome'='duplicate','same immutable request resolves once';
 BEGIN PERFORM public.arcade_tri_step(a,run_id,revision,round_id,request,'take_score');RAISE EXCEPTION 'conflict admitted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='arcade:request_conflict';END;
 ASSERT public.arcade_tri_step(a,run_id,revision,round_id,gen_random_uuid(),'draw')->>'outcome'='stale','stale revision rejected';
 revision:=(v#>>'{record,revision}')::bigint;
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(at_ms-1)),due_at=at_ms-1 WHERE private.arcade_runs.id=run_id;
 v:=public.arcade_tri_step(a,run_id,revision,round_id,gen_random_uuid(),'draw');ASSERT v->>'outcome'='stale','deadline owns late command';
 ASSERT public.arcade_tri_step(a,run_id,revision-1,round_id,request,'draw')->>'outcome'='duplicate','lost response still resolves after timeout';
 r:=public.arcade_start(a,gen_random_uuid(),'run21');
 BEGIN PERFORM public.arcade_tri_step(a,(r->>'id')::uuid);RAISE EXCEPTION 'wrong game admitted';EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='arcade:not_found';END;
END $$;
SELECT 'PASS: direct step retains access, ownership, game, intro/Ready/deadline, redaction, revision and receipt contracts; all synthetic data rolled back' AS proof;
ROLLBACK;
