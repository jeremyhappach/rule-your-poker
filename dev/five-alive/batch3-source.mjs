// Read-only source screen. Output is evidence for editorial review, not answers.
// Run with the installed Bun runtime (SQLite is bundled); no Python install needed.
import {Database} from 'bun:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {strict as assert} from 'node:assert';
const source=process.argv[2];assert.ok(source,'Pass the existing pinned ESDB checkout');
const revision=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(revision,'1e5b7d3a72f47a71da5d28686c1dd4b397178485');
const hash=b=>createHash('sha256').update(b).digest('hex');
const base='qualification.local/five-alive/frequency/';
assert.equal(hash(readFileSync(base+'oanc-lingevo.zip')),'79ac39a8ce2070302b170f114f8ea34193314319fdf6f3f9be8e383b8fae2d15');
const db=new Database(source+'/scowl.db',{readonly:true});
const metadata=db.query(`SELECT w.word,w.pos,g.defn_note,g.usage_note,
 min(s.size) size,group_concat(DISTINCT v.spelling||':'||v.variant_level) variants
 FROM words w JOIN groups g USING(group_id) JOIN base_poses p USING(base_pos)
 JOIN scowl_data s ON s.group_id=w.group_id AND s.pos=w.pos
 LEFT JOIN lemma_variant_info v ON v.lemma_id=w.lemma_id
 WHERE w.word_id=w.lemma_id AND length(w.word)=5 AND w.word NOT GLOB '*[^a-z]*'
 AND p.pos_category='' AND g.usage_note='' AND g.group_rank='' AND w.entry_rank=''
 AND s.size<=50 AND s.category='' AND s.tag='' AND s.region IN ('','US')
 AND (v.lemma_id IS NULL OR (v.spelling IN ('A','_') AND v.variant_level<=1))
 GROUP BY w.word,w.pos,g.defn_note,g.usage_note`).all();
const read=p=>readFileSync(p,'utf8');
const guesses=new Set(read('server/fiveAlive/guesses.esdb.txt').trim().split(/\r?\n/));
const existing=new Set(read('server/fiveAlive/answers.reviewed.v2.txt').trim().split(/\r?\n/).map(s=>s.split(' ')[0]));
const written=new Map(),spoken=new Map();
for(const line of read(base+'written.csv').trim().split(/\r?\n/).slice(1)){
 const [lemma,pos,count,_million,_genres,...genres]=line.split(',');
 if(!/^[a-z]{5}$/.test(lemma)||!['NOUN','VERB','ADJ','ADV'].includes(pos))continue;
 const record=written.get(lemma)??{count:0,genres:new Set()};record.count+=Number(count);
 genres.forEach((n,i)=>{if(Number(n)>0)record.genres.add(i);});written.set(lemma,record);
}
for(const line of read(base+'spoken.csv').trim().split(/\r?\n/).slice(1)){const [word,count]=line.split(',');if(/^[a-z]{5}$/.test(word))spoken.set(word,Number(count));}
const byWord=new Map();
for(const m of metadata){const word=m.word.toUpperCase();if(!guesses.has(word)||existing.has(word))continue;
 const entry=byWord.get(word)??{word,esdb:[],frequency:{written:written.get(m.word)?.count??0,genres:written.get(m.word)?.genres.size??0,spoken:spoken.get(m.word)??0}};
 entry.esdb.push(m);byWord.set(word,entry);
}
const candidates=[...byWord.values()].sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:0);
writeFileSync(base+'batch3-source.json',JSON.stringify({revision,screen:'lowercase neutral American base lemmas, ESDB <=50; existing 753 excluded; frequencies are evidence, not approval',candidates},null,2));
console.log(JSON.stringify({candidates:candidates.length,words:candidates.map(x=>x.word).join(' ')}));
