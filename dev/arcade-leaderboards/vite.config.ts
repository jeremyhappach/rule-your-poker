import {defineConfig} from 'vite';
import base from '../arcade-timestamps/vite.config';
// Render the real sound button; the existing fixture supplies only local account data.
export default defineConfig({...base,resolve:{...base.resolve,alias:base.resolve.alias.filter(item=>item.find!=='@/components/GameplaySoundButton')}});
