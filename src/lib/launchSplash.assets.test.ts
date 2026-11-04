import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

it('preserves approved animation bytes and provides matching native iPhone launch dimensions',()=>{
 const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 expect(digest('public/launch-splash/approved-v1.mp4')).toBe('6301834f808981dce6ffa6f4fc1812d0632cadec8d51fd202bcefcbd8026ecd8');
 expect(digest('public/launch-splash/approved-v1.png')).toBe('e44cf6a6eddf603b20caec8067b7c3094b1b9b63ea54cfabee57b653f64d10a2');
 const html=readFileSync('index.html','utf8');
 const links=[...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\)"/g)];
 expect(links).toHaveLength(24);
 for(const [,path,w,h,scale,orientation]of links){
  const bytes=readFileSync('public'+path),landscape=orientation==='landscape';
  expect(bytes.toString('ascii',1,4)).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(Number(landscape?h:w)*Number(scale));
  expect(bytes.readUInt32BE(20)).toBe(Number(landscape?w:h)*Number(scale));
 }
});
