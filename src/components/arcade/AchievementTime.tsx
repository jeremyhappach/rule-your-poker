import {formatAchievementTime} from '@/lib/arcade/achievementTime';
import './achievementTime.css';

export function AchievementTime({completedAt}: {completedAt?: string | null}) {
  const label = formatAchievementTime(completedAt);
  return label
    ? <time dateTime={completedAt!} title="Achieved in your local time">{label}</time>
    : <span aria-label="Achievement time unavailable">—</span>;
}
