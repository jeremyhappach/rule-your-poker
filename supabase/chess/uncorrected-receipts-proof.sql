BEGIN;
CREATE FUNCTION pg_temp.chess_as(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;BEGIN PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;EXECUTE command INTO answer;RESET ROLE;RETURN answer;END $$;
DO $proof$
DECLARE users uuid[]:=ARRAY['d7dc1928-3727-4351-b0ff-0e80c81c2953'::uuid,'e13e2dd9-6b38-4073-a313-2286877af40c'::uuid];
 parent uuid;child uuid;offer_hash_i text;rev bigint;r jsonb;mode_i int;draw_i int;
BEGIN
 FOR mode_i IN 0..1 LOOP FOR draw_i IN 0..1 LOOP
  parent:=(pg_temp.chess_as(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,%L,''[{"game":"chess","stake":2}]''::jsonb))',gen_random_uuid(),users[2],mode_i=1))#>>'{}')::uuid;
  SELECT offer_hash INTO offer_hash_i FROM private.delayed_matches WHERE id=parent;
  PERFORM pg_temp.chess_as(users[2],format('SELECT public.delayed_respond(%L,%L,%L,''accept'')',parent,gen_random_uuid(),offer_hash_i));
  SELECT id,revision INTO child,rev FROM private.delayed_children WHERE match_id=parent;
  r:=private.delayed_record_outcome(child,rev,CASE WHEN draw_i=1 THEN 'draw' ELSE 'normal' END,CASE WHEN draw_i=1 THEN NULL ELSE users[1] END,'{"proof":"uncorrected receipt regression"}');
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=child AND organizer_delta=2*(1-draw_i))
   OR NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=parent AND game_id=parent AND organizer_delta=2*(1-draw_i))
   OR EXISTS(SELECT FROM private.delayed_reopened_settlements WHERE match_id=parent)
   OR r IS DISTINCT FROM private.delayed_record_outcome(child,rev,CASE WHEN draw_i=1 THEN 'draw' ELSE 'normal' END,CASE WHEN draw_i=1 THEN NULL ELSE users[1] END,'{"proof":"uncorrected receipt regression"}')
  THEN RAISE EXCEPTION 'Uncorrected settlement regression';END IF;
 END LOOP;END LOOP;
END $proof$;
SELECT 'PASS: ordinary uncorrected Async winner and draw, real and fake money, canonical original receipts and replay' result;
ROLLBACK;
