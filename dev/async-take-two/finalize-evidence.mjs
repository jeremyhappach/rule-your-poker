import {readFileSync as read,writeFileSync as write,mkdirSync,copyFileSync} from 'node:fs';
const path='dev/async-take-two/preimage.json',all=JSON.parse(read(path));
const needed=['delayed_create','delayed_respond','delayed_load','delayed_commit','delayed_capabilities','delayed_reviews','delayed_review_begin','delayed_review_ack','delayed_review_board','delayed_actor','delayed_finale_ack','delayed_history_detail','take_two_board_deal','take_two_board_reduce','take_two_board_finish','take_two_visible','take_two_rules'];
write(path,JSON.stringify(all.filter(f=>needed.includes(f.name)),null,2)+'\n');
mkdirSync('dev/async-take-two/evidence',{recursive:true});
for(const f of ['local-financial.json','service.json','browser.json','continuation.json','recovery-worker.json'])copyFileSync('qualification.local/async-take-two/'+f,'dev/async-take-two/evidence/'+f);
console.log('Saved scoped qualification evidence');
