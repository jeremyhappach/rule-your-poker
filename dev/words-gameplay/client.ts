// Loopback browser harness transport. Authentication uses synthetic fixture identities.
const user = new URLSearchParams(location.search).get('user');
const request = async (path: string, body: object) => (await fetch('/fixture/' + path, {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ user, ...body }),
})).json();
const streams = new WeakMap<object, EventSource>();

export const supabase = {
  rpc: (name: string, args: object) => request('rpc', { name, args }),
  from: (table: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: () => request('read', { table }) }),
    }),
  }),
  channel() {
    const listeners: { table: string; changed: (payload: unknown) => void }[] = [];
    const channel = {
      on(_event: string, filter: { table?: string }, changed: (payload: unknown) => void) {
        if (filter.table) listeners.push({ table: filter.table, changed });
        return channel;
      },
      subscribe(status?: (value: string) => void) {
        if (!listeners.length) { queueMicrotask(() => status?.('SUBSCRIBED')); return channel; }
        const stream = new EventSource('/fixture/events');
        streams.set(channel, stream);
        stream.onopen = () => status?.('SUBSCRIBED');
        stream.onerror = () => status?.('CHANNEL_ERROR');
        stream.onmessage = event => {
          const value = JSON.parse(event.data);
          for (const listener of listeners) if (listener.table === value.table) listener.changed(value);
        };
        return channel;
      },
      track: async () => {},
      untrack: async () => {},
      presenceState: () => ({}),
    };
    return channel;
  },
  removeChannel(channel: object) { streams.get(channel)?.close(); },
};
