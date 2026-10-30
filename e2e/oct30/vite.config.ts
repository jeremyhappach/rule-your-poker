import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { readFileSync } from 'node:fs';
// Test-only counterfactual: load the exact baseline table owner.
// This transform is confined to this local harness and never enters app builds.
const baseline = process.env.OCT30_BASELINE === '1';
export default defineConfig({ plugins: [baseline ? {
  name: 'oct30-prior-financial-gate', enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('/src/components/MobileGameTable.tsx')) return;
    return readFileSync(path.resolve('../oct30-baseline-MobileGameTable.tsx'), 'utf8');
  },
} : null, react()], resolve: { alias: [
  { find: '@/integrations/supabase/client', replacement: path.resolve('e2e/oct30/client.ts') },
  { find: '@', replacement: path.resolve('src') },
] }, server: { host: '127.0.0.1', port: baseline ? 5187 : 5186, strictPort: true }, define: {
  __BUILD_HASH__: JSON.stringify('local-oct30'), __BUILD_TIMESTAMP__: JSON.stringify('local'),
  __APP_BUILD_SHA__: JSON.stringify('local'), __APP_BUILD_TIMESTAMP__: JSON.stringify('local'),
  __APP_DEPLOYMENT_ID__: JSON.stringify('local'), __RUN21_APP_TEST_LANE__: false,
} });
