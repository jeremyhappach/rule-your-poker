import {c} from './helpers.mjs';
import {readFileSync} from 'node:fs';
try {await c.query('BEGIN');await c.query(readFileSync('supabase/farkle/financial-correction/20261015/candidate.sql','utf8'));await c.query('COMMIT');console.log('Candidate applied only to isolated database');}finally {await c.end();}
