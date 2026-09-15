import { defineConfig, mergeConfig } from 'vite';
import appConfig from '../../vite.config';
export default defineConfig(env => mergeConfig(typeof appConfig === 'function' ? appConfig(env) : appConfig,
  { optimizeDeps: { entries: ['e2e/fixtures/cardVisibility.html'] }, build: { rollupOptions: { input: 'e2e/fixtures/cardVisibility.html' } } }));
