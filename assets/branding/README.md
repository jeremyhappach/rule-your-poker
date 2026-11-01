# Official Ptown Poker app icon

`ptown-poker-icon-source.png` is Jeremy's unmodified PNG supplied November 1,
2026. SHA-256: `de27c695eacc13e87a1ac3834c76e1a29df5b8ab35077ed80093d3f98c0156ff`.

`ptown-poker-icon-full-bleed.png` is the production master derived from that
artwork with the built-in image editing tool. Its outer mockup margin and
rounded frame were removed, with the background extended to square edges.
The metallic spade and bridge remain the design; the operating system supplies
the icon mask. SHA-256:
`ff006b36efc22424bea6d4e1aa1a4065f64c9fccf6a5d90247f7da382e3a0e8f`.

Edit prompt:

> Edit target: the attached official Ptown Poker icon PNG. Prepare this exact artwork for an iOS/web app icon. Remove ONLY the outer black margin and the rounded-square mockup bezel/frame. Make the bridge/sky/water scene extend all the way to all four square edges and corners, with no baked-in rounded corners, no border, no drop shadow, no padding, no transparency. Preserve the exact central metallic ace-of-spades design, shape, proportions, texture and highlights, and preserve the bridge towers, bridge lights, sky and water design. Crop away the outer mockup margin and fill only any missing corner background as needed. Do not redesign, reinterpret, add or simplify anything. Flat front-facing full-bleed square icon artwork. Keep the entire spade visible with enough breathing room for the operating system's rounded mask. No text.

Run `.codex/scripts/generate-app-icons.ps1` to deterministically resize the
committed master with Windows System.Drawing (no added dependencies). It emits
opaque RGB PNGs at 16, 32, 180, 192 and 512 px, an ICO with 16/32/48 px frames,
and conventional root favicon/Apple Touch Icon fallbacks.

HTML and manifest references use `ptown-poker-v1` filenames; the HTML manifest
link also has a version query. Use a new filename version for later artwork.
Keep the manifest ID, start URL, scope and standalone mode stable. Do not
unregister service workers, clear storage or delete push subscriptions to refresh
icons. The push-only worker has no fetch handler or app asset cache.

Physical iPhone acceptance: reload the production site in Safari, use Share →
Add to Home Screen, confirm the new icon and `Ptown Poker` name, and open it in
standalone mode. Keep an existing push-enabled installation in place during
testing; its stored icon may not refresh automatically. A separate installation
may require its own notification permission through the existing enrollment UI.

See [WebKit's Home Screen icons and app identity guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
