import {describe,it,expect} from 'vitest';
import {formatAchievementTime} from './achievementTime';

describe('stored achievement instants',()=>{
  it.each([
    [2026,10,2,20,42,'11/02/26 8:42 PM'],
    [2025,0,1,0,5,'01/01/25 12:05 AM'],
    [2027,11,31,12,9,'12/31/27 12:09 PM'],
  ])('uses the viewer calendar, year and 12-hour time', (year,month,day,hour,minute,label)=>{
    expect(formatAchievementTime(new Date(year,month,day,hour,minute).toISOString())).toBe(label);
  });
  it.each([null,undefined,'','invalid','2026-11-02','2026-11-02T20:42:00','2026-13-02T20:42:00Z'])('does not invent a time for %s',value=>{
    expect(formatAchievementTime(value)).toBeNull();
  });
  it('preserves offset instants and database fractional seconds',()=>{
    expect(formatAchievementTime('2026-11-02T20:42:00.123456-06:00')).toBe(formatAchievementTime('2026-11-03T02:42:00.123456Z'));
  });
});
