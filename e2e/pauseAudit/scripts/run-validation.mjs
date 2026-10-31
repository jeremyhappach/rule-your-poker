// The repository config uses __dirname. Vite's non-bundling runner does not
// inject it, so supply the repository root without writing shared dependencies.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const mode=process.argv[2];
if(!['test','build'].includes(mode))throw Error('Expected test or build');
globalThis.__dirname=process.cwd();
const cli=path.resolve('node_modules',mode==='test'?'vitest/vitest.mjs':'vite/bin/vite.js');
process.argv=[process.argv[0],cli,...process.argv.slice(3)];
await import(pathToFileURL(cli).href);
