// Prints a transaction-contained proof for the Supabase SQL tool or psql.
import {readFileSync} from 'node:fs';
const candidate=readFileSync('supabase/five-alive/difficulty-relative-v1.sql','utf8');
const template=readFileSync('dev/five-alive/difficulty.rollback.proof.sql','utf8');
process.stdout.write(template.replace('-- CANDIDATE_SQL',()=>candidate).replace('-- IDEMPOTENCE_SQL',()=>candidate));
