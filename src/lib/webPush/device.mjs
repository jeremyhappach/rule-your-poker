/** Browser permission and application preference are intentionally independent. */
export function deviceStatus(env, subscribed = false) {
  if (env.ios && !env.standalone) return 'home-screen';
  if (!env.secure || !env.supported) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  if (env.permission !== 'granted') return subscribed ? 'revoked' : 'permission-needed';
  return subscribed ? 'enabled' : 'device-off';
}

/** Called directly by a trusted click handler. No async work precedes the OS prompt. */
export async function enableFromGesture(port) {
  if (!port.gesture()) throw Error('Tap Enable on this device to continue.');
  const state = port.status();
  if (['home-screen', 'unsupported', 'denied'].includes(state)) throw Error(state);
  const permission = port.permission() === 'granted' ? 'granted' : await port.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'permission-needed';
  await port.subscribe();
  return 'enabled';
}

export function authorizedDestination(payload, userId, home) {
  if (!payload || home.id !== payload.matchId || !home.players.some(p => p.id === userId)) return null;
  if (home.removedAt) return '/delayed';
  // Landing always revalidates every child and review gate; never trust a push's turn state.
  return '/delayed/' + home.id;
}

export const statusText = {
  'home-screen': 'On iPhone or iPad, add Ptown to your Home Screen, open it from that icon, then enable notifications here (iOS/iPadOS 16.4 or later).',
  unsupported: 'Push notifications are not supported in this browser. Try a supported browser over HTTPS.',
  denied: 'Notifications are blocked. Allow them in your browser or device settings, then return here.',
  revoked: 'Notification permission was removed. Re-enable it in your browser or device settings.',
  'permission-needed': 'Your browser has not granted notification permission.',
  'device-off': 'Browser permission is allowed. Enable this device to receive Ptown notifications.',
  enabled: 'This device is enabled. Match preferences still control which notifications you receive.',
};
