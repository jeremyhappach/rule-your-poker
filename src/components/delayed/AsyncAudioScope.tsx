import {useEffect} from 'react';
import {Outlet} from 'react-router-dom';
import {platformAudio} from '@/lib/audio/platformAudio';

/** Keep the entry gesture's engine through release checks, result review and auto-start. */
export function AsyncAudioScope() {
  useEffect(() => platformAudio.acquireGameplay(), []);
  return <Outlet/>;
}
