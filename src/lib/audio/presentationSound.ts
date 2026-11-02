import {platformAudio} from '@/lib/audio/platformAudio';
import {approvedSound, type ApprovedSound} from './approvedSounds';

export function isSoundSurfaceVisible(element: Element | null): boolean {
  if (!element?.isConnected || document.hidden || !navigator.onLine) return false;
  if (element.closest('[inert]')) return false;
  // The canonical fullscreen shell keeps the board mounted under its tab sheet.
  // A visible modal/sheet therefore hides gameplay acoustically as well.
  const modal = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  if (modal && modal.getClientRects().length && !modal.contains(element)) return false;
  if ('checkVisibility' in element && !element.checkVisibility({visibilityProperty: true, opacityProperty: true})) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
    && rect.top < document.documentElement.clientHeight && rect.left < document.documentElement.clientWidth;
}

/** Call at the existing visible presentation boundary with a durable identity.
 * Inaudible events are consumed too, so unmute/recovery never catches them up. */
export function presentSound(name: ApprovedSound, identity: string, surface: Element | null) {
  const {userId} = platformAudio.getSnapshot();
  if (!userId) return;
  platformAudio.present({userId, id: `palette:${name}:${identity}`,
    cue: isSoundSurfaceVisible(surface) ? approvedSound(name) : undefined});
}

/** React 18 does not forward transitionrun. Attach the native visual edge. */
export function cardFlipSoundRef(identity: string, enabled: boolean) {
  return (node: HTMLDivElement | null) => {
    if (node) node.ontransitionrun = event => {
      if (enabled && event.target === node && event.propertyName === 'transform') presentSound('flip', identity, node);
    };
  };
}
