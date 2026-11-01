# Approved matte nighttime Ptown Poker icon

`ptown-poker-icon-source.png` is Jeremy's unmodified
`Ptown-Poker-Matte-Night-Approved.png`, supplied November 1, 2026.
SHA-256: `63ed580a874ea74fba513106fd74eebc423a4cbc0bc64efa3e0ea8f56bd05653`.
It supersedes the glossy artwork released in `57e9430da`.

`ptown-poker-icon-full-bleed.png` is the opaque 1024 px production master.
SHA-256: `f796edf70e280879eaf0384f1fa48e8c84f394e1c2a0caa656c16f20de6972f3`.
The spade and interior scene retain the original pixels, position, colors and
composition. Only the rounded perimeter is extended to square edges, using
neighboring pixels from the approved source. There is no generative repainting
in the released artwork. The operating system supplies its own icon mask.

Run `.codex/scripts/generate-app-icons.ps1` to deterministically prepare the
master and resize it with built-in Windows System.Drawing. The perimeter
extension reflects source pixels horizontally outside an inset rounded interior
(16 px inset, 220 px radius); the first/last 16 rows use the adjacent interior
row. The approved spade's entire bounding rectangle, x=208..791 / y=200..875,
is preserved pixel-for-pixel.

Outputs are opaque RGB PNGs at 16, 32, 180, 192 and 512 px, an ICO containing
16/32/48 px PNG frames, and conventional root favicon/Apple Touch fallbacks.
Android has a separate 512 px maskable filename with the same composition:
the entire spade fits inside the central 40%-radius safe circle without scaling.
See the [manifest safe-zone specification](https://www.w3.org/TR/appmanifest/#icon-masks).
The bridge and water remain a full-bleed decorative background.

HTML, social metadata and manifest icons use `ptown-poker-v2` filenames;
the manifest link uses `?v=ptown-icon-2`. Existing v1 files remain available
for older cached references. Manifest ID, start URL, scope, name, short name,
colors and standalone display are unchanged. Do not unregister service workers,
clear storage or delete push subscriptions to refresh icons. The push-only worker
has no fetch handler or app-asset cache; its local push store is unchanged.

Physical iPhone acceptance:

1. Keep the existing push-enabled Home Screen installation.
2. Reload [holm357.com](https://holm357.com) in Safari and use Share → Add to
   Home Screen. Confirm the matte icon and default `Ptown Poker` name.
3. Add a separate verification copy if needed; a temporary distinct name can
   distinguish it from the existing installation. Launch it and confirm standalone
   display. Inspect the spade, silver outline, edge mask and warm bridge lighting.
4. Confirm an ordinary notification still arrives on the original installation.
   The new copy does not need notification enrollment to verify its icon.

Existing iPhone installations may retain their stored icon. No removal or
re-enrollment is required for this release. See
[WebKit's Home Screen identity and multiple-install guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
