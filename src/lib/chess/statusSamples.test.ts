import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {chessStatusPCM} from './statusSamples';
it('preserves the approved PCM waveforms',()=>{
 const hashes={heartbeat:'ec7425ec63c90a2afadc463aba9bd83c2dd6959a072bbfc8f76517bf1add421a',win:'ff1ee8b197ba00e542d6f7573e488e0a7e609682e702a3cbfca0d90e9ea95a23',loss:'4439fcf1732eab460d39c1b89168149dad665b4cc70b6b6de3628524b579a70f'};
 for(const key of ['heartbeat','win','loss'] as const){const {samples}=chessStatusPCM[key],bytes=Buffer.alloc(samples.length*2);samples.forEach((v,i)=>bytes.writeInt16LE(Math.round(v*32768),i*2));expect(createHash('sha256').update(bytes).digest('hex')).toBe(hashes[key]);}
});