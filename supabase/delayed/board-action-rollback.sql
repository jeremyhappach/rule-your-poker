-- After reverting server routing and allowing in-flight requests to drain.
DROP FUNCTION IF EXISTS public.delayed_board_action(uuid,uuid,text,uuid,bigint,bigint,jsonb);
