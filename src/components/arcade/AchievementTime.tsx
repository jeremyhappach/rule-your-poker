import {formatAchievementTime} from '@/lib/arcade/achievementTime';
import './achievementTime.css';

export function AchievementTime({completedAt,splitLines=false}: {completedAt?: string | null;splitLines?:boolean}) {
  const label = formatAchievementTime(completedAt);
  return label
    ? <time dateTime={completedAt!} title="Achieved in your local time">{splitLines?<><span>{label.slice(0,label.indexOf(' '))}</span>{' '}<span>{label.slice(label.indexOf(' ')+1)}</span></>:label}</time>
    : <span aria-label="Achievement time unavailable">—</span>;
}
