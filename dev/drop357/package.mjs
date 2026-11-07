import {readFileSync,writeFileSync} from 'node:fs';
const files=['supabase/drop357/rules.sql','supabase/drop357/arcade.sql'];
writeFileSync('supabase/migrations/20261107195319_drop357_arcade_v1.sql',files.map(f=>readFileSync(f,'utf8')).join('\n'));
