import { vi } from 'vitest';

/** A fixed browser-tab media environment, with real EventTarget listener semantics. */
export function installBrowserMedia() {
  vi.stubGlobal('matchMedia', (media: string): MediaQueryList => {
    const target = new EventTarget();
    return Object.assign(target, {
      media,
      matches: media === 'all' || media === 'screen' || media === '(display-mode: browser)',
      onchange: null,
      addListener: (listener: EventListener) => target.addEventListener('change', listener),
      removeListener: (listener: EventListener) => target.removeEventListener('change', listener),
    }) as MediaQueryList;
  });
}
