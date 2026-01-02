-- Allow admins to delete transactions
CREATE POLICY "Admins can delete transactions"
ON public.player_transactions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));