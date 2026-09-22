import {describe,it,expect} from 'vitest';
import {drawPairRect,drawHelpRect,safeFeltRect,intersects,type Rect} from './safeFelt';
describe('Run21 canonical exclusions',()=>{
  it.each([1.09,1.3])('keeps all corners inside the felt and clears either seat at aspect %i',aspect=>{
    for(const right of [false,true]){
      const zones:Rect[]=[{x:right?.75:0,y:.04,width:.25,height:.25},{x:0,y:1.01,width:1,height:1},{x:.4,y:1,width:.2,height:.2}];
      const r=safeFeltRect(zones,aspect);
      expect(r.width).toBeGreaterThan(.4);expect(r.height).toBeGreaterThan(.5);
      expect(zones.some(z=>intersects(r,z))).toBe(false);
      for(const x of [r.x,r.x+r.width])for(const y of [r.y,r.y+r.height])expect((2*x-1)**2+(2*y-1)**2).toBeLessThanOrEqual(.985);
    }
  });
  it('fails closed if the canonical shell leaves no room',()=>{
    expect(safeFeltRect([{x:0,y:0,width:1,height:1}]).width).toBe(0);
  });
  it('reserves only help for an observer, leaving absent draw cards out of seat clearance',()=>{
    const seat={x:.42,y:.65,width:.18,height:.3};
    const draw=drawPairRect([seat],1.09,.88,false),help=drawHelpRect(draw);
    expect(help.y).toBeGreaterThan(.8);
    expect(intersects(help,seat)).toBe(false);
    const area=safeFeltRect([seat,help],1.09);
    expect(area.height).toBeGreaterThan(.4);
    expect(intersects(area,help)||intersects(area,seat)).toBe(false);
  });
  it('keeps the column area above the bottom-center draw cards',()=>{
    for(const aspect of [1.09,1.3,1.42]){
      const reserved=[{x:0,y:.03,width:.25,height:.28},{x:0,y:.04,width:1,height:.08},{x:.42,y:.76,width:.16,height:.22}];
      const draw=drawPairRect(reserved,aspect);
      const area=safeFeltRect([...reserved,draw],aspect);
      expect(area.width).toBeGreaterThan(.4);expect(area.height).toBeGreaterThan(.2);
      expect(draw.x+draw.width/2).toBeCloseTo(.5);
      expect(draw.height/(draw.width*.46*aspect)).toBeCloseTo(1.5);
      expect(draw.y).toBeGreaterThan(area.y+area.height);
      expect(reserved.some(r=>intersects(draw,r)||intersects(area,r))).toBe(false);
    }
  });
  it.each([1.09,1.3,1.42,1.67])('docks at the rim and restores column height at aspect %i',aspect=>{
    const visible=[{x:.04,y:.03,width:.18,height:.28},{x:0,y:.04,width:1,height:.08}];
    const endpoint={x:.42,y:.78,width:.16,height:.18};
    const draw=drawPairRect(visible,aspect);
    const oldDraw=drawPairRect([...visible,endpoint],aspect,.82);
    const area=safeFeltRect([...visible,draw],aspect),oldArea=safeFeltRect([...visible,oldDraw],aspect);
    expect(draw.y+draw.height).toBeGreaterThanOrEqual(.96);
    expect(draw.y+draw.height).toBeLessThanOrEqual(.98);
    expect(draw.height).toBeCloseTo(.22);
    const help=drawHelpRect(draw);
    expect(help.x+help.width).toBeLessThan(draw.x);
    expect(help.y+help.height/2).toBeCloseTo(draw.y+draw.height/2);
    expect(visible.some(r=>intersects(help,r))).toBe(false);
    expect(area.height).toBeGreaterThan(oldArea.height+.1);
    expect(intersects(draw,endpoint)).toBe(true);
    for(const x of [draw.x,draw.x+draw.width])for(const y of [draw.y,draw.y+draw.height])expect((2*x-1)**2+(2*y-1)**2).toBeLessThanOrEqual(.985);
  });
});
