import {deflateSync, inflateSync} from 'node:zlib';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = Array.from({length:256}, (_, n) => {
  for (let k=0;k<8;k++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1;
  return n>>>0;
});
function crc(bytes) {
  let n=0xffffffff;
  for (const byte of bytes) n=crcTable[(n^byte)&255]^(n>>>8);
  return (n^0xffffffff)>>>0;
}
function chunk(type, data) {
  const out=Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length);out.write(type,4,4,'ascii');data.copy(out,8);
  out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);
  return out;
}
const paeth=(a,b,c)=>{
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
};
const prediction=(f,a,b,c)=>f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c);

/** Narrow offline encoder: non-interlaced 8-bit RGB/RGBA only; never quantizes. */
export function decodePng(bytes) {
  if (!bytes.subarray(0,8).equals(signature)) throw Error('Not a PNG');
  const chunks=[];
  for (let off=8;off<bytes.length;) {
    const size=bytes.readUInt32BE(off),end=off+12+size;
    if(end>bytes.length)throw Error('Truncated PNG');
    const type=bytes.toString('ascii',off+4,off+8),data=bytes.subarray(off+8,end-4);
    if(crc(bytes.subarray(off+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('PNG CRC mismatch');
    chunks.push({type,data});off=end;
  }
  const head=chunks[0];
  if(head?.type!=='IHDR'||head.data.length!==13||chunks.at(-1)?.type!=='IEND')throw Error('Invalid PNG structure');
  const width=head.data.readUInt32BE(0),height=head.data.readUInt32BE(4),color=head.data[9];
  if(head.data[8]!==8||![2,6].includes(color)||head.data[10]||head.data[11]||head.data[12])throw Error('Requires non-interlaced RGB/RGBA PNG');
  if(chunks.some(c=>c.type==='acTL'||c.type==='tRNS'))throw Error('Animated/key-transparent PNG is outside this encoder');
  const channels=color===6?4:3,stride=width*channels;
  const filtered=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)));
  if(filtered.length!==(stride+1)*height)throw Error('Unexpected pixel length');
  const pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++) {
    const src=y*(stride+1),dst=y*stride,f=filtered[src];
    if(f>4)throw Error('Unknown PNG filter');
    for(let x=0;x<stride;x++)pixels[dst+x]=(filtered[src+1+x]+prediction(f,x>=channels?pixels[dst+x-channels]:0,y?pixels[dst-stride+x]:0,y&&x>=channels?pixels[dst-stride+x-channels]:0))&255;
  }
  return {width,height,channels,pixels,chunks,filtered};
}

export function rgba(image) {
  if(image.channels===4)return image.pixels;
  const out=Buffer.alloc(image.width*image.height*4,255);
  for(let src=0,dst=0;src<image.pixels.length;src+=3,dst+=4)image.pixels.copy(out,dst,src,src+3);
  return out;
}

function filterPixels(pixels,width,height,channels) {
  const stride=width*channels,out=Buffer.alloc((stride+1)*height),row=Buffer.alloc(stride);
  for(let y=0;y<height;y++) {
    let best=Infinity;
    for(let f=0;f<5;f++) {
      let score=0;
      for(let x=0;x<stride;x++) {
        const at=y*stride+x,value=(pixels[at]-prediction(f,x>=channels?pixels[at-channels]:0,y?pixels[at-stride]:0,y&&x>=channels?pixels[at-stride-channels]:0))&255;
        row[x]=value;score+=Math.min(value,256-value);
      }
      if(score<best){best=score;out[y*(stride+1)]=f;row.copy(out,y*(stride+1)+1);}
    }
  }
  return out;
}

function encode(image,channels,pixels,filtered) {
  const head=Buffer.from(image.chunks[0].data);head[9]=channels===4?6:2;
  const compressed=deflateSync(filtered??filterPixels(pixels,image.width,image.height,channels),{level:9});
  const parts=[signature];let emitted=false;
  for(const c of image.chunks) {
    if(c.type==='IHDR')parts.push(chunk(c.type,head));
    else if(c.type==='IDAT'){if(!emitted){parts.push(chunk('IDAT',compressed));emitted=true;}}
    else parts.push(chunk(c.type,c.data));
  }
  return Buffer.concat(parts);
}

export function optimizePng(original) {
  const image=decodePng(original);
  // Keeping the original is also a candidate: optimization never grows a file.
  let best=original;
  const consider=candidate=>{if(candidate.length<best.length)best=candidate;};
  consider(encode(image,image.channels,image.pixels,image.filtered));
  consider(encode(image,image.channels,image.pixels));
  // Remove only a completely opaque alpha channel. Keep any real transparency.
  // Ancillary chunks with channel-dependent semantics conservatively prevent it.
  const opaque=image.channels===4&&!image.chunks.some(c=>!['IHDR','IDAT','IEND'].includes(c.type))&&image.pixels.every((v,i)=>i%4!==3||v===255);
  if(opaque){
    const rgb=Buffer.alloc(image.width*image.height*3);
    for(let src=0,dst=0;src<image.pixels.length;src+=4,dst+=3)image.pixels.copy(rgb,dst,src,src+3);
    consider(encode(image,3,rgb));
  }
  const result=decodePng(best);
  if(result.width!==image.width||result.height!==image.height||!rgba(image).equals(rgba(result)))throw Error('Lossless pixel verification failed');
  return {bytes:best,width:image.width,height:image.height,pixels:rgba(image)};
}
