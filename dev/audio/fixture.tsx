import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRun21Bell } from '../../src/hooks/useRun21Bell';
import { platformAudio, probe } from './fixtureOwner';
import { doorbellCue, knockCue, ginScratchCue } from '../../src/lib/audio/platformCues';

function Round({id, remaining}: {id: string; remaining: number}) {
  useRun21Bell('browser-user', id, remaining);
  return <p>Intro: {id}</p>;
}
function Fixture() {
  const [intro, setIntro] = useState<{id: string; remaining: number} | null>(() =>
    new URLSearchParams(location.search).has('locked') ? {id: 'locked-first-observed', remaining: 1000} : null);
  Object.assign(window, { audioProbe: {
    probe, manager: platformAudio,
    enter: (id: string, remaining = 2500) => setIntro({id, remaining}),
    leave: () => setIntro(null),
    mute: (enabled: boolean) => platformAudio.setPreference('browser-user', !enabled),
    existing: () => { platformAudio.play(doorbellCue); platformAudio.play(knockCue); platformAudio.play(ginScratchCue); },
  } });
  return <><button id="pregame" onClick={() => setTimeout(() => setIntro({id: 'session:game:hand:1:player1', remaining: 2500}), 50)}>Ready in lobby</button>{intro && <Round {...intro}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
