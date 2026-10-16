import { platformAudio } from '@/lib/audio/platformAudio';
import { knockCue } from '@/lib/audio/platformCues';

const playKnock = () => { platformAudio.play(knockCue); };
export const useKnockSound = () => ({ playKnock });
