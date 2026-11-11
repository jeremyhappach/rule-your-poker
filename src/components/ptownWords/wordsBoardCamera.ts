export interface Point { x: number; y: number }
export interface BoardSize { width: number; height: number }
export interface BoardCamera extends Point { scale: number }

export const fullBoard: BoardCamera = { scale: 1, x: 0, y: 0 };
const boardLimit = 736;
const maxScale = 4;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const fittedBoardSize = ({ width, height }: BoardSize) => Math.min(width, height, boardLimit);
const boardLeft = (size: BoardSize) => (size.width - fittedBoardSize(size)) / 2;

export function boundCamera(camera: BoardCamera, size: BoardSize): BoardCamera {
  const scale = clamp(camera.scale, 1, maxScale);
  if (scale === 1) return fullBoard;
  const fitted = fittedBoardSize(size);
  const scaled = fitted * scale;
  const left = boardLeft(size);
  return {
    scale,
    x: scaled <= size.width ? (fitted - scaled) / 2 : clamp(camera.x, size.width - scaled - left, 0 - left),
    y: clamp(camera.y, Math.min(0, size.height - scaled), 0),
  };
}

/** Keep the board point under the old midpoint underneath the new midpoint. */
export function zoomCamera(camera: BoardCamera, scale: number, from: Point, to: Point, size: BoardSize) {
  const bounded = clamp(scale, 1, maxScale);
  const ratio = bounded / camera.scale;
  const left = boardLeft(size);
  return boundCamera({
    scale: bounded,
    x: to.x - left - (from.x - left - camera.x) * ratio,
    y: to.y - (from.y - camera.y) * ratio,
  }, size);
}

export function focusWord(squares: readonly number[], size: BoardSize) {
  const fitted = fittedBoardSize(size);
  if (!fitted || !squares.length) return fullBoard;
  const rows = squares.map(square => Math.floor(square / 15));
  const columns = squares.map(square => square % 15);
  const top = Math.min(...rows), bottom = Math.max(...rows);
  const left = Math.min(...columns), right = Math.max(...columns);
  const stride = Math.min(boardLimit / 15, (size.width - 4) / (right - left + 1), (size.height - 4) / (bottom - top + 1));
  return zoomCamera(fullBoard, stride * 15 / fitted, {
    x: boardLeft(size) + fitted * (left + right + 1) / 30,
    y: fitted * (top + bottom + 1) / 30,
  }, { x: size.width / 2, y: size.height / 2 }, size);
}
