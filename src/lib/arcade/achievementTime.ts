/** Only format stored instants with an explicit timezone; never infer a legacy date. */
export function formatAchievementTime(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, '0');
  const hour = date.getHours();
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${pad(date.getFullYear() % 100)} ${hour % 12 || 12}:${pad(date.getMinutes())} ${hour < 12 ? 'AM' : 'PM'}`;
}
