import {createReviewServer} from './review-server.mjs';
const server=await createReviewServer({port:15325,preview:true});
console.log('Local fixture preview: http://127.0.0.1:15325/');
const stop=async()=>{await server.close();process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
