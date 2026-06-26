INSERT INTO public.system_settings (key, value)
VALUES (
  'card_front_design',
  '{
    "tiers": {
      "small":  {"twoColor": {"layout":"center-stack","rankScalePctOfCardWidth":42,"suitScalePctOfCardWidth":36,"rankSuitGapPctOfCardHeight":2,"groupOffsetXPctOfCardWidth":0,"groupOffsetYPctOfCardHeight":0}, "fourColor": {"layout":"rank-only","rankScalePctOfCardWidth":58,"rankOffsetXPctOfCardWidth":0,"rankOffsetYPctOfCardHeight":0}},
      "medium": {"twoColor": {"layout":"center-stack","rankScalePctOfCardWidth":56,"suitScalePctOfCardWidth":50,"rankSuitGapPctOfCardHeight":3,"groupOffsetXPctOfCardWidth":0,"groupOffsetYPctOfCardHeight":0}, "fourColor": {"layout":"rank-only","rankScalePctOfCardWidth":72,"rankOffsetXPctOfCardWidth":0,"rankOffsetYPctOfCardHeight":0}},
      "large":  {"twoColor": {"layout":"center-stack","rankScalePctOfCardWidth":64,"suitScalePctOfCardWidth":58,"rankSuitGapPctOfCardHeight":4,"groupOffsetXPctOfCardWidth":0,"groupOffsetYPctOfCardHeight":0}, "fourColor": {"layout":"rank-only","rankScalePctOfCardWidth":82,"rankOffsetXPctOfCardWidth":0,"rankOffsetYPctOfCardHeight":0}}
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;