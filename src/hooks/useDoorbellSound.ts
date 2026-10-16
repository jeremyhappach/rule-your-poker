import { platformAudio } from '@/lib/audio/platformAudio';
import { doorbellCue } from '@/lib/audio/platformCues';

const playDoorbell = () => { platformAudio.play(doorbellCue); };
export const useDoorbellSound = () => ({ playDoorbell });
