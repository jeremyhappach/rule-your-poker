import {readFileSync} from 'node:fs';
const source=readFileSync('supabase/multiplayer-money/admission.sql','utf8');
const guard=source.slice(source.indexOf('DO $$ BEGIN'),source.indexOf('END $$;')+7);
const proof=readFileSync('.codex/evidence/multiplayer-money/production-proof.sql','utf8');
process.stdout.write(process.argv.includes('--installed')?proof:proof.replace('BEGIN;\n',()=> 'BEGIN;\n'+guard+'\n'));
