process.env.GOLF_LOCAL_CONTEXT='qualification.local/golf-sweep-smoke/context.json';
process.env.GOLF_LOCAL_PORT='5213';
await import('./serve.mjs');
