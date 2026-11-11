import { expect, it } from 'vitest';
import { boundCamera, focusWord, fullBoard, zoomCamera } from './wordsBoardCamera';

const size = { width: 360, height: 360 };

it('keeps the point under the pinch midpoint stable as both distance and midpoint move', () => {
  const from = { x: 120, y: 150 };
  const to = { x: 142, y: 160 };
  const camera = zoomCamera(fullBoard, 2, from, to, size);
  expect(camera).toEqual({ scale: 2, x: -98, y: -140 });
  expect({ x: camera.x + from.x * camera.scale, y: camera.y + from.y * camera.scale }).toEqual(to);
  expect(zoomCamera(camera, 0.8, to, from, size)).toEqual(fullBoard);
});

it('clamps oversized zoom and panning at each edge', () => {
  expect(boundCamera({ scale: 8, x: -9000, y: 9000 }, size)).toEqual({ scale: 4, x: -1080, y: 0 });
  expect(boundCamera({ scale: 4, x: 9000, y: -9000 }, size)).toEqual({ scale: 4, x: 0, y: -1080 });
});

it('keeps a fitted short-landscape board centered horizontally while allowing vertical pan', () => {
  expect(boundCamera({ scale: 2, x: 500, y: -500 }, { width: 540, height: 170 })).toEqual({ scale: 2, x: -85, y: -170 });
});

it('fits the entire scored word while focusing its reveal', () => {
  const camera = focusWord([112, 113, 114, 115, 116], size);
  const stride = 360 / 15 * camera.scale;
  expect(camera.scale).toBeGreaterThan(1);
  expect(camera.x + 7 * stride).toBeGreaterThanOrEqual(0);
  expect(camera.x + 12 * stride).toBeLessThanOrEqual(360);
});
