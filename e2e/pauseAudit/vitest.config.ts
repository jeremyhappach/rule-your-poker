import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},esbuild:{jsx:'automatic'},test:{include:['e2e/pauseAudit/*.test.tsx','src/lib/authoritativeSubscription.test.ts','src/hooks/authoritativeSubscription.recovery.test.tsx'],environment:'jsdom',maxWorkers:1,fileParallelism:false,testTimeout:10000,setupFiles:['e2e/pauseAudit/setup.ts']}});
