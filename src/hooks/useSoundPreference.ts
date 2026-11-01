import {useSyncExternalStore} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';

export function useSoundPreference() {
  return useSyncExternalStore(platformAudio.subscribe, platformAudio.getSnapshot, platformAudio.getSnapshot);
}
