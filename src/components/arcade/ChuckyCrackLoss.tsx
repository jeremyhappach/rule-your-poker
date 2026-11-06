import {useLayoutEffect, useRef, useState, type CSSProperties, type RefObject} from 'react';
import {HeartCrack} from 'lucide-react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {chuckyShatterCue} from '@/lib/chuckyShowdown/shatterCue';

export const crackLiftMs = 2050;
const flightMs = 650;
export const crackEndMs = crackLiftMs + flightMs + 360;

const fragments = [
  {clip: '0 0,45% 0,53% 38%,28% 52%,0 41%', x: -20, y: -15, angle: -30},
  {clip: '45% 0,100% 0,100% 31%,68% 46%,53% 38%', x: 20, y: -16, angle: 29},
  {clip: '0 41%,28% 52%,44% 74%,0 86%', x: -27, y: 8, angle: -49},
  {clip: '28% 52%,53% 38%,68% 46%,57% 72%,44% 74%', x: -5, y: 20, angle: 28},
  {clip: '68% 46%,100% 31%,100% 85%,57% 72%', x: 27, y: 14, angle: 45},
  {clip: '0 86%,44% 74%,57% 72%,100% 85%,100% 100%,0 100%', x: 4, y: 34, angle: -25},
];

interface Props {
  table: RefObject<HTMLDivElement>;
  remaining: number;
  elapsed: number;
  identity: string;
  userId: string;
}

export function ChuckyCrackLoss({table, remaining, elapsed, identity, userId}: Props) {
  const flight = useRef<HTMLDivElement>(null);
  const [ageAtMount] = useState(() => Math.max(0, elapsed - crackLiftMs));
  useLayoutEffect(() => {
    const host = table.current;
    const heart = flight.current;
    const slot = host?.querySelectorAll('.cs-cracks svg')[remaining];
    const choice = host?.querySelector('.cs-choice');
    const label = choice?.querySelector('.cs-hand-label');
    if (!host || !heart || !slot || !choice || !label) return;
    const start = performance.now() - ageAtMount;
    let animation: Animation | undefined;
    const fit = () => {
      const base = host.getBoundingClientRect(), icon = slot.getBoundingClientRect();
      const band = choice.getBoundingClientRect(), labelBottom = label.getBoundingClientRect().bottom;
      const endX = band.left + band.width * .53 - base.left, endY = (band.bottom + labelBottom) / 2 - base.top;
      const startX = icon.left + icon.width / 2 - base.left, startY = icon.top + icon.height / 2 - base.top;
      const size = Math.max(15, Math.min(40, band.bottom - labelBottom - 7));
      heart.style.width = heart.style.height = size + 'px';
      heart.style.left = (endX - size / 2) + 'px';
      heart.style.top = (endY - size / 2) + 'px';
      const frames = Array.from({length: 13}, (_, index) => {
        const t = index / 12, u = 1 - t;
        const x = u * u * startX + 2 * u * t * (base.width - 14) + t * t * endX;
        const scale = (icon.width + (size - icon.width) * t) / size;
        return {transform: `translate(${x - endX}px, ${(startY - endY) * u}px) rotate(${-14 * Math.sin(t * Math.PI)}deg) scale(${scale})`};
      });
      animation?.cancel();
      animation = heart.animate(frames, {duration: flightMs, easing: 'ease-in-out', fill: 'both'});
      animation.currentTime = Math.max(0, performance.now() - start);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => {observer.disconnect(); animation?.cancel();};
  }, [table, remaining, ageAtMount]);

  function shatter() {
    platformAudio.present({userId, id: 'chucky-shatter:' + identity,
      cue: isSoundSurfaceVisible(table.current) ? chuckyShatterCue : undefined});
  }

  return <div ref={flight} className="cs-lost-heart" aria-hidden="true"
    style={{'--impact-delay': (flightMs - ageAtMount) + 'ms'} as CSSProperties}>
    <HeartCrack className="cs-whole-heart" strokeWidth={1.8}/>
    {fragments.map(({clip, x, y, angle}, index) => <span key={clip} className="cs-fragment"
      onAnimationStart={index === 0 ? shatter : undefined}
      style={{clipPath: 'polygon(' + clip + ')', '--scatter': `translate(${x}px,${y}px) rotate(${angle}deg)`} as CSSProperties}>
      <HeartCrack strokeWidth={1.8}/>
    </span>)}
  </div>;
}
