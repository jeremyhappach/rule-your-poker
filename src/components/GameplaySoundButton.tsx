import {useEffect} from 'react';
import {Volume2, VolumeX} from 'lucide-react';
import {toast} from 'sonner';
import {platformAudio} from '@/lib/audio/platformAudio';
import {useSoundPreference} from '@/hooks/useSoundPreference';

export function GameplaySoundButton() {
  const {userId, enabled, saving} = useSoundPreference();
  useEffect(() => platformAudio.acquireGameplay(), []);
  const label = enabled === null ? 'Loading sound preference' : enabled ? 'Mute sounds' : 'Unmute sounds';
  return <button type="button" className="delayed-bell shrink-0 self-center" aria-label={label} title={label}
    aria-pressed={enabled === false} disabled={!userId || enabled === null || saving}
    onClick={() => { if (userId) void platformAudio.togglePreference(userId).catch(error => toast.error(error.message)); }}>
    {enabled ? <Volume2 size={19} aria-hidden="true"/> : <VolumeX size={19} aria-hidden="true"/>}
  </button>;
}
