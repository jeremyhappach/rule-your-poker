import { platformAudio } from '@/lib/audio/platformAudio';
import { audioTrace } from '@/lib/audio/audioTrace';
import { preloadApprovedSounds } from '@/lib/audio/approvedSounds';

// Observe native scheduling while the real mixer processes a cue.
const scheduled: {cue:string; context:string}[] = [];
const present = platformAudio.present.bind(platformAudio);
const start = AudioBufferSourceNode.prototype.start;
let currentCue: string | undefined;
platformAudio.present = (event, onScheduled) => {
  currentCue = event.id;
  try { return present(event,onScheduled); }
  finally { currentCue = undefined; }
};
AudioBufferSourceNode.prototype.start = function(...args: Parameters<AudioBufferSourceNode['start']>) {
  start.apply(this,args);
  if (currentCue) scheduled.push({cue:currentCue,context:this.context.state});
};

const params = new URLSearchParams(location.search);
platformAudio.install();
platformAudio.setUser(params.get('user'));
audioTrace.start();
Object.assign(window, {
  readWordsAudioTrace: () => JSON.parse(audioTrace.export()).entries,
  readWordsScheduledAudio: () => scheduled,
});
void preloadApprovedSounds().then(() => { document.body.dataset.audioLoaded = 'true'; });

if (params.get('mode') === 'live') void import('../ptown-words/live');
else void import('../async-latency-release/words');
