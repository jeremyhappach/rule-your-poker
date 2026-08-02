-- Phase 1 — Geometry Lab Global Defaults Platform: seed shared row for
-- the 3-5-7 showdown rules domain. Value is the frozen LIVE_BASELINE so a
-- fresh fetch matches the renderer's pre-migration baseline byte-for-byte.
-- Migration behavior: Option A (preserve current established values).
-- The shared row seeded here equals LIVE_BASELINE; admins whose device has
-- pre-existing localStorage edits will see them auto-loaded as the modal
-- DRAFT on first open after this migration. The shared row is only updated
-- when the admin explicitly clicks Apply Changes. Until then, the shared
-- baseline is what every client receives.
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'three_five_seven_showdown_rules',
  '{
    "anchor": { "kind": "belowChip", "belowChipGapPx": 2 },
    "opponentRowPlacement": { "anchor": "chipstack-center", "attachment": "chip-centered", "xPctOfPlayfield": 0, "yPctOfPlayfield": 0 },
    "three":  { "size": { "mobileWidthPx": 40, "mobileHeightPx": 64, "smWidthPx": 44, "smHeightPx": 68 }, "overlap": { "mobilePx": 4,  "smPx": 4  }, "fan": { "stepDeg": 2 }, "dyn": { "enabled": true,  "aspect": 0.71, "minCardWidth": 28, "maxCardWidth": 80, "maxOverlapRatio": 0.6, "preferredOverlapRatio": 0.18 } },
    "five":   { "size": { "mobileWidthPx": 32, "mobileHeightPx": 48, "smWidthPx": 36, "smHeightPx": 56 }, "overlap": { "mobilePx": 12, "smPx": 12 }, "fan": { "stepDeg": 2 }, "dyn": { "enabled": false, "aspect": 0.71, "minCardWidth": 28, "maxCardWidth": 80, "maxOverlapRatio": 0.6, "preferredOverlapRatio": 0.18 } },
    "seven":  { "size": { "mobileWidthPx": 32, "mobileHeightPx": 48, "smWidthPx": 36, "smHeightPx": 56 }, "overlap": { "mobilePx": 12, "smPx": 12 }, "fan": { "stepDeg": 2 }, "dyn": { "enabled": false, "aspect": 0.71, "minCardWidth": 28, "maxCardWidth": 80, "maxOverlapRatio": 0.6, "preferredOverlapRatio": 0.18 } },
    "sevenIrrelevant": { "visible": true, "dimmed": true, "scale": 0.85, "opacity": 0.4, "grayscalePct": 30, "interRowGapPx": 2, "size": { "mobileWidthPx": 24, "mobileHeightPx": 36, "smWidthPx": 28, "smHeightPx": 40 }, "overlap": { "mobilePx": 8, "smPx": 8 }, "positionMode": "auto" }
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
