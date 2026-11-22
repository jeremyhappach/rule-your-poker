import {createReviewServer} from '../../async-combined/review-server.mjs';
await createReviewServer({port:15513,preview:true,cacheDir:'node_modules/.vite-five-alive-polish-preview'});
console.log('Picker: http://127.0.0.1:15513/dev/five-alive/presentation/tiles.html');
console.log('Results: http://127.0.0.1:15513/dev/five-alive/presentation/results.html');
