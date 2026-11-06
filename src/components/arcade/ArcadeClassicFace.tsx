import { memo } from 'react';
import type {Rank, Suit} from '@/lib/cardUtils';

const fontFamily = '"Times New Roman", Times, serif';
const rankTransforms = new Map<string, string>();
let context: CanvasRenderingContext2D | null = null;

// Center the visible ink for each rank, including a numeric pair and letters with descenders.
function rankTransform(rank: string) {
  const saved = rankTransforms.get(rank);
  if (saved) return saved;
  context ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!context) return 'translate(50 77.5) scale(.85)';

  context.font = 'bold 100px ' + fontFamily;
  context.textAlign = 'center';
  const ink = context.measureText(rank);
  const height = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
  const width = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
  if (!(height > 0 && width > 0)) return 'translate(50 77.5) scale(.85)';

  const sy = 58 / height;
  const sx = Math.min(sy, 81 / width);
  const x = 50 - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) * sx / 2;
  const y = 19.5 + ink.actualBoundingBoxAscent * sy;
  const transform = `translate(${x} ${y}) scale(${sx} ${sy})`;
  rankTransforms.set(rank, transform);
  return transform;
}

const suits: Record<Suit, {width: number; path: string}> = {
 '♥':{width:37,path:'M50 99 C42 88 1 59 1 32 C1 5 31 -8 50 18 C69 -8 99 5 99 32 C99 59 58 88 50 99Z'},
 '♦':{width:29,path:'M50 0 L98 50 L50 100 L2 50Z'},
 '♠':{width:36,path:'M50 0 C39 17 1 41 1 61 C1 80 23 91 44 73 C43 83 39 91 32 99 L68 99 C61 90 57 82 56 73 C77 91 99 80 99 61 C99 41 61 17 50 0Z'},
 '♣':{width:37,path:'M45 69 C28 93 1 82 1 61 C1 42 20 31 35 39 C16 24 29 0 50 0 C71 0 84 24 65 39 C80 31 99 42 99 61 C99 82 72 93 55 69 C56 81 60 91 68 100 H32 C40 91 44 81 45 69Z'},
};

export const ArcadeClassicFace = memo(function ArcadeClassicFace({rank, suit}: {rank: Rank; suit: Suit}) {
  const symbol = suits[suit];
  return <svg aria-hidden="true" data-arcade-classic-face={rank} className="absolute inset-0"
    viewBox="0 0 100 140" width="100%" height="100%" fill={suit === '♥' || suit === '♦' ? '#c21f2d' : '#111315'}>
    <text textAnchor="middle" fontFamily={fontFamily} fontSize="100" fontWeight="bold" transform={rankTransform(rank)}>{rank}</text>
    <svg data-arcade-classic-suit={suit} x={50 - symbol.width / 2} y="85.5" width={symbol.width} height="35"
      viewBox="0 0 100 100" preserveAspectRatio="none"><path d={symbol.path}/></svg>
  </svg>;
});
