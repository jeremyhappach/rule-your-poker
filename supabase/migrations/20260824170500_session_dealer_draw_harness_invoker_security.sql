-- The public arm/status/cancel RPCs need no RLS bypass. Run them with the
-- authenticated caller's privileges so the existing system_settings policies
-- remain a second authorization boundary in addition to the explicit admin
-- role check in each function.

ALTER FUNCTION public.get_session_dealer_draw_tie_harness()
  SECURITY INVOKER;
ALTER FUNCTION public.arm_session_dealer_draw_tie_harness(integer)
  SECURITY INVOKER;
ALTER FUNCTION public.cancel_session_dealer_draw_tie_harness()
  SECURITY INVOKER;
