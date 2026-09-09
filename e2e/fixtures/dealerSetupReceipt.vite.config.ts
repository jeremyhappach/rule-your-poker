import { defineConfig, mergeConfig } from 'vite';
import appConfig from '../../vite.config';

// Keep this local control's dependency scan out of retained artifact HTML.
// Production's configuration and entrypoint remain unchanged.
export default defineConfig(env => mergeConfig(
  typeof appConfig === 'function' ? appConfig(env) : appConfig,
  {
    optimizeDeps: { entries: ['e2e/fixtures/dealerSetupReceipt.html'] },
    build: { rollupOptions: { input: 'e2e/fixtures/dealerSetupReceipt.html' }, emptyOutDir: false },
  },
));
