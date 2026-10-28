import type {CSSProperties} from 'react';

/** Existing 357 felt/seat leg anchors, shared without changing their geometry. */
export const viewerLegPlacement:CSSProperties={position:'absolute',bottom:'8px',left:'55%'};
export function seatLegPlacement(isRightSide:boolean):CSSProperties {
 return {position:'absolute',top:'50%',...(isRightSide
  ?{left:'6px',transform:'translateY(-50%) translateX(-100%)'}
  :{right:'6px',transform:'translateY(-50%) translateX(100%)'})};
}
