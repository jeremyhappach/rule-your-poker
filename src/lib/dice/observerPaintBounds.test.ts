import {expect,it} from 'vitest';
import {rectVmin} from '@/lib/wave4LayoutResolver/units';
import {fitObserverPaintBounds,DICE_OBSERVER_PAINT} from './observerPaintBounds';
it('preserves assigned width despite a legacy shallow rectangle and reserves the actual pot',()=>{
 const result=fitObserverPaintBounds(rectVmin(0,30,75,22),rectVmin(0,0,75,100),28);
 expect(result.width.value).toBe(75);
 expect(result.height.value).toBe(75*DICE_OBSERVER_PAINT.height/DICE_OBSERVER_PAINT.width);
 expect(result.y.value).toBeGreaterThanOrEqual(28);
 expect(result.y.value+result.height.value).toBeLessThanOrEqual(100);
});
it('responds to a larger measured pot without inventing viewport offsets',()=>{
 const result=fitObserverPaintBounds(rectVmin(0,30,75,22),rectVmin(0,0,75,100),50);
 expect(result.y.value).toBe(50);
 expect(result.height.value).toBe(50);
 expect(result.width.value).toBeCloseTo(50*280/204);
});
