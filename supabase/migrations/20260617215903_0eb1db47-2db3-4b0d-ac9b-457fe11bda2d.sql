CREATE TABLE public.geometry_overrides (
  artifact_id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  anchor_x NUMERIC,
  anchor_y NUMERIC,
  anchor_origin TEXT,
  size_mode TEXT NOT NULL DEFAULT 'widthDriven',
  width_pct NUMERIC,
  height_pct NUMERIC,
  aspect_ratio NUMERIC,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.geometry_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.geometry_overrides TO authenticated;
GRANT ALL ON public.geometry_overrides TO service_role;

ALTER TABLE public.geometry_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read geometry overrides"
  ON public.geometry_overrides FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert geometry overrides"
  ON public.geometry_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update geometry overrides"
  ON public.geometry_overrides FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete geometry overrides"
  ON public.geometry_overrides FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_geometry_overrides_updated_at
  BEFORE UPDATE ON public.geometry_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.geometry_overrides;
ALTER TABLE public.geometry_overrides REPLICA IDENTITY FULL;