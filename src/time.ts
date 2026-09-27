export type Unit = 's' | 'm' | 'h' | 'd';

export interface DurationSegment {
  value: number;
  unit: Unit;
}

export interface ParsedDuration {
  totalSeconds: number;
  segments: DurationSegment[];
}

const UNIT_SECONDS: Record<Unit, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

// 同前缀的长单位要排在短单位之前，否则 "min" 会被拆成 "m" + "in"
const UNIT_ALIASES: ReadonlyArray<readonly [string, Unit]> = [
  ['小时', 'h'],
  ['hours', 'h'], ['hour', 'h'], ['hrs', 'h'], ['hr', 'h'], ['h', 'h'],
  ['天', 'd'], ['days', 'd'], ['day', 'd'], ['d', 'd'],
  ['分钟', 'm'], ['分', 'm'],
  ['minutes', 'm'], ['mins', 'm'], ['min', 'm'], ['m', 'm'],
  ['秒钟', 's'], ['秒', 's'],
  ['seconds', 's'], ['secs', 's'], ['sec', 's'], ['s', 's'],
];

/** Windows shutdown /t 的上限：10 年 */
export const MAX_SECONDS = 315_360_000;

/**
 * 解析 "1s" / "20m" / "1h30m" / "90" / "2分30秒" 这类时间表达。
 * 纯数字按秒处理；无法完整识别时返回 null。
 */
export function parseDuration(input: string): ParsedDuration | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return { totalSeconds: Math.round(value), segments: [{ value, unit: 's' }] };
  }

  const segments: DurationSegment[] = [];
  let rest = raw;
  while (rest.length > 0) {
    const matched = /^(\d+(?:\.\d+)?)(.*)$/.exec(rest);
    if (!matched) return null;
    const value = Number(matched[1]);
    const unitPart = matched[2] ?? '';
    const alias = UNIT_ALIASES.find(([name]) => unitPart.startsWith(name));
    if (!alias || !Number.isFinite(value)) return null;
    segments.push({ value, unit: alias[1] });
    rest = unitPart.slice(alias[0].length);
  }

  let totalSeconds = 0;
  for (const seg of segments) {
    totalSeconds += seg.value * UNIT_SECONDS[seg.unit];
  }
  return { totalSeconds: Math.round(totalSeconds), segments };
}

/** 90 -> "1 分钟 30 秒"；0 -> "0 秒" */
export function formatDuration(totalSeconds: number): string {
  let s = Math.max(0, Math.round(totalSeconds));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} 天`);
  if (h > 0) parts.push(`${h} 小时`);
  if (m > 0) parts.push(`${m} 分钟`);
  if (s > 0 || parts.length === 0) parts.push(`${s} 秒`);
  return parts.join(' ');
}

/** 倒计时用：3661 -> "1:01:01"，59 -> "00:59" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
