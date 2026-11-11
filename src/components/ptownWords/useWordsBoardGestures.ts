import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { boundCamera, fullBoard, zoomCamera } from './wordsBoardCamera';
import type { BoardCamera, BoardSize, Point } from './wordsBoardCamera';

export type TileOrigin = { tileId: number; square?: number };
export type DragTile = TileOrigin & { letter: string; value: number };
export type DropTarget = { kind: 'square'; square: number } | { kind: 'rack' };
type Surface = { kind: 'board'; square?: number } | { kind: 'rack'; tileId: number } | { kind: 'reset' };
type Pointer = { point: Point; element: HTMLElement; touch: boolean };
type TileGhost = { tile: DragTile; point: Point; origin: Point; touch: boolean; target?: DropTarget; returning?: boolean };
type Gesture =
  | { kind: 'press'; id: number; surface: Surface; start: Point; tile?: DragTile; canPan: boolean }
  | { kind: 'drag'; id: number; ghost: TileGhost }
  | { kind: 'pan'; id: number; start: Point; camera: BoardCamera }
  | { kind: 'pinch'; start: Point; distance: number; camera: BoardCamera }
  | { kind: 'blocked' };

interface Options {
  host: RefObject<HTMLDivElement>;
  board: RefObject<HTMLDivElement>;
  enabled: boolean;
  scope: string;
  tileAt: (surface: Surface) => DragTile | undefined;
  canDrop: (tile: TileOrigin, target: DropTarget) => boolean;
  drop: (tile: TileOrigin, target: DropTarget) => void;
  tapSquare: (square: number) => void;
  tapRack: (tileId: number) => void;
}

const movementThreshold = 6;
const pointAt = (event: { clientX: number; clientY: number }) => ({ x: event.clientX, y: event.clientY });
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (point: Point, rect: DOMRect) =>
  point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;

function dropTarget(host: HTMLDivElement | null, point: Point): DropTarget | undefined {
  const element = document.elementFromPoint(point.x, point.y);
  if (!element || !host?.contains(element)) return;
  const cell = element.closest<HTMLElement>('[data-square]');
  if (cell) return { kind: 'square', square: Number(cell.dataset.square) };
  if (element.closest('.words-rack')) return { kind: 'rack' };
}

export function useWordsBoardGestures({ host, board, enabled, scope, tileAt, canDrop, drop, tapSquare, tapRack }: Options) {
  const [camera, setCamera] = useState(fullBoard);
  const cameraRef = useRef(fullBoard);
  const [size, setSize] = useState<BoardSize>({ width: 0, height: 0 });
  const [ghost, setGhost] = useState<TileGhost>();
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<Gesture | null>(null);

  const updateCamera = useCallback((next: BoardCamera) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);
  const reset = useCallback(() => updateCamera(fullBoard), [updateCamera]);
  const interrupt = useCallback(() => {
    gesture.current = null;
    const captured = [...pointers.current];
    pointers.current.clear();
    for (const [id, { element }] of captured) {
      if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    }
    setGhost(undefined);
  }, []);

  const resetZoom = () => {
    interrupt();
    reset();
    board.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    interrupt();
  }, [enabled, interrupt, scope]);

  useLayoutEffect(() => {
    const element = board.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [board, scope]);

  useLayoutEffect(() => {
    interrupt();
    updateCamera(boundCamera(cameraRef.current, size));
  }, [interrupt, size, updateCamera]);

  useEffect(() => {
    const outsideDown = (event: PointerEvent) => {
      if (pointers.current.size && event.target instanceof Node && !host.current?.contains(event.target)) interrupt();
    };
    const onVisibility = () => { if (document.hidden) interrupt(); };
    window.addEventListener('pointerdown', outsideDown, true);
    window.addEventListener('blur', interrupt);
    window.addEventListener('pagehide', interrupt);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerdown', outsideDown, true);
      window.removeEventListener('blur', interrupt);
      window.removeEventListener('pagehide', interrupt);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [host, interrupt]);

  const localPoint = useCallback((point: Point) => {
    const element = board.current;
    if (!element) return point;
    const rect = element.getBoundingClientRect();
    return { x: point.x - rect.left - element.clientLeft, y: point.y - rect.top - element.clientTop };
  }, [board]);

  useEffect(() => {
    const element = board.current;
    if (!element || !enabled) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      interrupt();
      const current = cameraRef.current;
      const focal = localPoint(pointAt(event));
      updateCamera(zoomCamera(current, current.scale * Math.exp(-event.deltaY * 0.009), focal, focal, size));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [board, enabled, interrupt, localPoint, scope, size, updateCamera]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0 || !(event.target instanceof HTMLElement) || !host.current?.contains(event.target)) return;
    const element = event.target.closest<HTMLElement>('button') ?? event.target;
    const resetButton = element.closest('[data-words-reset]:enabled');
    const rackTile = element.closest<HTMLButtonElement>('.words-rack [data-tile-id]:enabled');
    const cell = element.closest<HTMLElement>('[data-square]');
    const onBoard = !!board.current?.contains(element);
    if (!onBoard && !rackTile && !resetButton && !pointers.current.size) return;

    const point = pointAt(event);
    pointers.current.set(event.pointerId, { point, element, touch: event.pointerType === 'touch' });
    element.setPointerCapture?.(event.pointerId);
    setGhost(undefined);

    if (pointers.current.size > 1) {
      const [a, b] = [...pointers.current.values()];
      const rect = board.current?.getBoundingClientRect();
      gesture.current = pointers.current.size === 2 && rect && a.touch && b.touch && inside(a.point, rect) && inside(b.point, rect)
        ? { kind: 'pinch', start: localPoint(midpoint(a.point, b.point)), distance: Math.max(1, distance(a.point, b.point)), camera: cameraRef.current }
        : { kind: 'blocked' };
      return;
    }

    const surface: Surface = resetButton ? { kind: 'reset' } : rackTile
      ? { kind: 'rack', tileId: Number(rackTile.dataset.tileId) }
      : { kind: 'board', square: cell ? Number(cell.dataset.square) : undefined };
    gesture.current = {
      kind: 'press', id: event.pointerId, surface, start: point, tile: tileAt(surface),
      canPan: onBoard && !cell?.classList.contains('has-tile'),
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointers.current.get(event.pointerId);
    const current = gesture.current;
    if (!pointer || !current) return;
    pointer.point = pointAt(event);
    if (current.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!b) return;
      const scale = current.camera.scale * distance(a.point, b.point) / current.distance;
      updateCamera(zoomCamera(current.camera, scale, current.start, localPoint(midpoint(a.point, b.point)), size));
      return;
    }

    if (current.kind === 'blocked' || current.id !== event.pointerId) return;
    const point = pointer.point;
    if (current.kind === 'press') {
      if (distance(point, current.start) < movementThreshold) return;
      if (current.tile) {
        const bounds = (pointer.element.closest('[data-square],[data-tile-id]') ?? pointer.element).getBoundingClientRect();
        const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        gesture.current = { kind: 'drag', id: current.id, ghost: { tile: current.tile, point, origin, touch: pointer.touch } };
      } else if (current.canPan && cameraRef.current.scale > 1) {
        gesture.current = { kind: 'pan', id: current.id, start: current.start, camera: cameraRef.current };
      } else {
        gesture.current = { kind: 'blocked' };
      }
    }
    const next = gesture.current;
    if (next?.kind === 'pan') {
      updateCamera(boundCamera({
        scale: next.camera.scale, x: next.camera.x + point.x - next.start.x, y: next.camera.y + point.y - next.start.y,
      }, size));
    }
    if (next?.kind === 'drag') {
      const target = dropTarget(host.current, point);
      next.ghost = { ...next.ghost, point, target: target && canDrop(next.ghost.tile, target) ? target : undefined };
      setGhost(next.ghost);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    const current = gesture.current;
    gesture.current = pointers.current.size ? { kind: 'blocked' } : null;
    if (!enabled || !current || !('id' in current) || current.id !== event.pointerId) return;
    const point = pointAt(event);
    if (current.kind === 'press' && distance(point, current.start) < movementThreshold) {
      if (current.surface.kind === 'reset') resetZoom();
      else if (current.surface.kind === 'rack') tapRack(current.surface.tileId);
      else if (current.surface.square !== undefined) tapSquare(current.surface.square);
    }
    if (current.kind === 'drag') {
      const target = dropTarget(host.current, point);
      if (target && canDrop(current.ghost.tile, target)) {
        setGhost(undefined);
        drop(current.ghost.tile, target);
      } else {
        setGhost({ ...current.ghost, point, target: undefined, returning: true });
      }
    }
  }

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    gesture.current = pointers.current.size ? { kind: 'blocked' } : null;
    setGhost(undefined);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    const current = cameraRef.current;
    const center = { x: size.width / 2, y: size.height / 2 };
    const dx = Number(event.key === 'ArrowLeft') - Number(event.key === 'ArrowRight');
    const dy = Number(event.key === 'ArrowUp') - Number(event.key === 'ArrowDown');
    if (event.key === 'Escape') reset();
    else if (event.key === '+' || event.key === '=' || event.key === '-') {
      updateCamera(zoomCamera(current, current.scale * (event.key === '-' ? 0.8 : 1.25), center, center, size));
    } else if (current.scale > 1 && (dx || dy)) {
      updateCamera(boundCamera({ scale: current.scale, x: current.x + dx * size.width / 5, y: current.y + dy * size.height / 5 }, size));
    } else return;
    event.preventDefault();
    interrupt();
  }

  return {
    camera, size, ghost, reset, resetZoom, onKeyDown,
    clearGhost: () => setGhost(undefined),
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancelPointer, onLostPointerCapture: cancelPointer },
  };
}
