CREATE FUNCTION pg_temp.sealed_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF NEW.id::text=current_setting('sealed.fail_match',true) AND NEW.status='session_ended' THEN RAISE EXCEPTION 'sealed:injected_failure';END IF;RETURN NEW;
END $$;
CREATE TRIGGER sealed_proof_failure BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.sealed_injected_failure();
DO $$
DECLARE a uuid;b uuid;m uuid;child uuid;before_s jsonb;r jsonb;at_i bigint;rejected boolean:=false;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;
 m:=pg_temp.sealed_fixture('take-two',true);SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
 UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '12 hours' WHERE id=child;
 FOR i IN 1..2 LOOP PERFORM pg_temp.sealed_empty(child,a);PERFORM pg_temp.sealed_empty(child,b);END LOOP;
 PERFORM pg_temp.sealed_empty(child,a);SELECT to_jsonb(c) INTO before_s FROM private.delayed_children c WHERE id=child;
 PERFORM set_config('sealed.fail_match',m::text,true);
 BEGIN PERFORM pg_temp.sealed_empty(child,b);EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'sealed:injected_failure' THEN RAISE;END IF;rejected:=true;END;
 PERFORM pg_temp.sealed_assert(rejected,'injected financial failure reached');
 PERFORM pg_temp.sealed_assert((SELECT to_jsonb(c)=before_s FROM private.delayed_children c WHERE id=child),'failure rolls back gameplay and receipt');
 PERFORM pg_temp.sealed_assert(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=m) AND NOT EXISTS(SELECT FROM public.games WHERE id=m),'failure rolls back all canonical financial writes');
 PERFORM set_config('sealed.fail_match','',true);PERFORM pg_temp.sealed_empty(child,b);PERFORM pg_temp.sealed_finance(m,true);
 m:=pg_temp.sealed_fixture('run21',false);SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
 UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '80 hours' WHERE id=child;
 r:=public.delayed_sealed_load(child,a);at_i:=floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000);
 PERFORM public.delayed_sealed_commit(child,a,(r->>'revision')::bigint,r->'state','tick',at_i,false);
 PERFORM pg_temp.sealed_assert((SELECT terminal AND outcome->>'reason'='draw' FROM (SELECT c.terminal,private.delayed_child_record(c)->'outcome' outcome FROM private.delayed_children c WHERE id=child) s),'both absent draws');
 PERFORM pg_temp.sealed_finance(m,false);
 rejected:=false;PERFORM set_config('request.jwt.claim.sub',a::text,true);
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,'[{"game":"boxdrop","stake":0}]');EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_child' THEN RAISE;END IF;rejected:=true;END;
 PERFORM pg_temp.sealed_assert(rejected,'invalid stake rejected');
END $$;
DROP TRIGGER sealed_proof_failure ON public.games;
SELECT 'PASS: financial failure rollback, safe retry, both absent draw, invalid stake' sealed_atomic_proof;
