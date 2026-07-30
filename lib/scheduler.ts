// Scheduling lives here and nowhere else. Nothing in the interface names a
// strength, an interval, or a due date — cards simply appear when they
// should. Simplified SM-2: strength 0–5, intervals in days.
import { localDay } from './repo';

const INTERVALS = [1, 2, 4, 8, 16, 32];

export type Grade = 'got' | 'again' | 'solid' | 'shaky' | 'missed';

/**
 * Everything the scheduler needs, and nothing about what is being
 * scheduled — one curve serves both captured items and lexeme sets.
 */
export interface Schedulable {
  strength: number;
  lastSeen: string | null;
  nextDue: string;
  timesSeen: number;
  timesMissed: number;
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

function intervalFor(strength: number): number {
  return INTERVALS[Math.min(Math.max(strength, 0), INTERVALS.length - 1)];
}

/**
 * Apply one grade to an item's state. Feed swipes are got/again; the
 * Phase-4 Check adds solid/shaky/missed.
 */
export function grade<T extends Schedulable>(state: T, result: Grade, today = localDay()): T {
  const now = new Date().toISOString();
  let strength = state.strength;
  let days: number;
  let missed = state.timesMissed;

  switch (result) {
    case 'got':
    case 'solid':
      strength = Math.min(5, strength + 1);
      days = intervalFor(strength);
      break;
    case 'shaky':
      // Hold the strength, halve the interval.
      days = Math.max(1, Math.round(intervalFor(strength) / 2));
      break;
    case 'again':
      strength = Math.max(0, strength - 1);
      days = 1;
      missed += 1;
      break;
    case 'missed':
      strength = 1;
      days = 1;
      missed += 1;
      break;
  }

  return {
    ...state,
    strength,
    lastSeen: now,
    nextDue: addDays(today, days),
    timesSeen: state.timesSeen + 1,
    timesMissed: missed,
  };
}

export function isDue(state: Schedulable, today = localDay()): boolean {
  return state.nextDue <= today;
}
