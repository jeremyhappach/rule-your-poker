import {createReviewServer} from './review-server.mjs';
const server=await createReviewServer({port:15327,preview:true});
console.log('Fixture-only polish preview: http://127.0.0.1:15327/');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
