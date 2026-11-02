import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  cacheDir: repo + '/qualification.local/sound-lab/vite-cache',
  root, envDir:repo, publicDir: false, plugins: [react()],
  resolve: {alias: [
    {find: '@/lib/audio/platformAudio', replacement: root + 'labAudio.ts'},
    {find: '@', replacement: repo + '/src'},
  ]},
  server: {host: '0.0.0.0', port: 4317, strictPort: true, fs: {allow: [repo]}},
  build: {outDir: repo + '/qualification.local/sound-lab/site', emptyOutDir: true},
});
