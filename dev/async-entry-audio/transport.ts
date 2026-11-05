export {supabase, DelayedRequestError, gameName} from '../async-input-audio/transport';
export const delayedRequest = (body: unknown) => fetch('/fixture-api', {method: 'POST', body: JSON.stringify(body)}).then(r => r.json());
export const delayedRpc = (name: string, args: unknown) => delayedRequest({op: 'rpc', name, args});
