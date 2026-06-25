UPDATE public.system_settings
SET value = '{"placement":{"attachment":"chip-centered","xPctOfFelt":0,"yPctOfFelt":0},"rounds":{"r1":{"card":{"mode":"fixed","cardWidthPx":40,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0}},"r2":{"card":{"mode":"fixed","cardWidthPx":44,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0}},"r3":{"card":{"mode":"fixed","cardWidthPx":48,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0},"secondary":{"visibility":"dimmed","placement":"below","offsetPrimaryPct":10,"offsetCrossPct":0,"scale":0.75,"opacity":0.6,"grayscale":0.4}}}}'::jsonb,
    updated_at = now()
WHERE key = 'three_five_seven_showdown_rules';

INSERT INTO public.system_settings (key, value)
SELECT 'three_five_seven_showdown_rules',
'{"placement":{"attachment":"chip-centered","xPctOfFelt":0,"yPctOfFelt":0},"rounds":{"r1":{"card":{"mode":"fixed","cardWidthPx":40,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0}},"r2":{"card":{"mode":"fixed","cardWidthPx":44,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0}},"r3":{"card":{"mode":"fixed","cardWidthPx":48,"aspectRatio":1.4},"row":{"overlap":0.35,"fanDegrees":0},"secondary":{"visibility":"dimmed","placement":"below","offsetPrimaryPct":10,"offsetCrossPct":0,"scale":0.75,"opacity":0.6,"grayscale":0.4}}}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'three_five_seven_showdown_rules');