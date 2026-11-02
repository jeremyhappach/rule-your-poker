import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {vi} from 'vitest';
import {preloadApprovedSounds} from './approvedSounds';
export async function loadAuditionedFixtures() {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const bytes = readFileSync(new URL('../../assets/audio/' + basename(String(input)), import.meta.url));
    return {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)} as Response;
  });
  await preloadApprovedSounds();
  fetcher.mockRestore();
}
