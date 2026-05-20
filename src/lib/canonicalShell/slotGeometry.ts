import type { CanonicalSlot } from './seatAnchors';

export interface CanonicalSlotGeometry {
  className: string;
  point: { x: string; y: string };
  alignEnd: boolean;
}

export function getCanonicalSlotGeometry(slot: CanonicalSlot | null | undefined): CanonicalSlotGeometry {
  switch (slot) {
    case -2:
      return { className: 'top-14 left-1/2 -translate-x-1/2 items-center', point: { x: '50%', y: '18%' }, alignEnd: false };
    case -1:
      return { className: 'bottom-14 left-1/2 -translate-x-1/2 items-center', point: { x: '50%', y: '82%' }, alignEnd: false };
    case 0:
      return { className: 'bottom-14 left-6 items-start', point: { x: '14%', y: '82%' }, alignEnd: false };
    case 1:
      return { className: 'top-1/2 left-6 -translate-y-1/2 items-start', point: { x: '10%', y: '50%' }, alignEnd: false };
    case 2:
      return { className: 'top-14 left-6 items-start', point: { x: '14%', y: '18%' }, alignEnd: false };
    case 3:
      return { className: 'top-14 right-6 items-end', point: { x: '86%', y: '18%' }, alignEnd: true };
    case 4:
      return { className: 'top-1/2 right-6 -translate-y-1/2 items-end', point: { x: '90%', y: '50%' }, alignEnd: true };
    case 5:
      return { className: 'bottom-14 right-6 items-end', point: { x: '86%', y: '82%' }, alignEnd: true };
    default:
      return { className: 'top-14 left-6 items-start', point: { x: '14%', y: '18%' }, alignEnd: false };
  }
}