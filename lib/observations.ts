// The report.
//
// Not a page. A page of six statistics gets opened once and never again,
// because on the second visit it says the same thing — which is exactly the
// failure direction-v2 predicts for anything that "fires on a schedule
// without being asked". What survives is one line that is often simply not
// there.
//
// So: at most one observation, ever, and only when it clears a threshold
// that makes it true rather than merely computable. Everything here is
// arithmetic on dates and counts the user themselves produced. Nothing is
// generated, nothing is inferred, and nothing says a thing the data does not
// carry. Below its gate an observation returns null and is simply absent.
//
// The rule every one of these obeys: it must say something you could not
// have guessed. "You wrote 12 lines this month" is not an observation, it is
// a receipt.
import { loadLines } from './line';
import { loadSessions, localDay } from './repo';
import { loadSets } from './sets';
import type { DailyLine, LanguageCode } from './types';

/** Languages whose writing separates words with spaces. */
const SPACED: LanguageCode[] = ['es', 'ru', 'ko'];

export interface Observation {
  /** A stable id, so the same day always shows the same one. */
  key: string;
  text: string;
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (!y1 || !y2) return 0;
  return Math.round(
    (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000
  );
}

/**
 * The same calendar date, n years back. Not `day - 365 * n`: leap days make
 * that drift a day or two out over five years, so the anniversary would
 * quietly start landing on the wrong date — and a quotation attached to the
 * wrong day is worse than no quotation. 29 February simply has no
 * anniversary in a common year, which is correct.
 */
function yearsBack(day: string, years: number): string | null {
  const [y, m, d] = day.split('-').map(Number);
  if (!y) return null;
  const then = new Date(y - years, m - 1, d);
  if (then.getMonth() !== m - 1 || then.getDate() !== d) return null;
  return localDay(then);
}

/** Whitespace tokens, lowercased, stripped of surrounding punctuation. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 1);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The line from exactly a year ago, or two, or five. The oldest wins — five
 * years back beats one. Cannot be wrong: it is a lookup on the day.
 */
function anniversary(lines: DailyLine[], today: string): Observation | null {
  const byDate = new Map(lines.map((l) => [l.date, l]));
  for (let years = 5; years >= 1; years -= 1) {
    const then = yearsBack(today, years);
    const line = then ? byDate.get(then) : undefined;
    if (line) {
      return {
        key: `anniversary.${years}`,
        text: `${plural(years, 'year', 'years')} ago today — ${line.text}`,
      };
    }
  }
  return null;
}

/**
 * The longest stretch with nothing at all. Subtraction on days the client
 * itself wrote, so it cannot be wrong. Says nothing under a fortnight,
 * because a week off is not a fact about you.
 */
function longestGap(days: string[], today: string): Observation | null {
  if (days.length < 10) return null;
  const sorted = [...new Set(days)].sort();
  let worst = 0;
  let endedOn = '';
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = daysBetween(sorted[i - 1], sorted[i]) - 1;
    if (gap > worst) {
      worst = gap;
      endedOn = sorted[i];
    }
  }
  if (worst < 14) return null;
  const [y, m, d] = endedOn.split('-').map(Number);
  const month = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long' });
  return {
    key: 'gap',
    text: `${plural(worst, 'day', 'days')} away in ${month} — the longest gap so far.`,
  };
}

/**
 * Words you have written that the app never taught you. The most honest
 * thing in here: it measures the language you actually reach for, not the
 * language you were handed. Only computed for languages that space their
 * words — character segmentation for Japanese and Chinese would be guessing.
 */
async function beyondTheBank(lines: DailyLine[]): Promise<Observation | null> {
  const written = lines.filter((l) => SPACED.includes(l.languageCode));
  if (written.length < 30) return null;

  const bank = new Set<string>();
  for (const set of await loadSets()) {
    for (const r of set.renderings) {
      if (SPACED.includes(r.languageCode)) for (const w of words(r.term)) bank.add(w);
    }
  }
  if (bank.size === 0) return null;

  const mine = new Set<string>();
  for (const line of written) for (const w of words(line.text)) mine.add(w);

  const beyond = [...mine].filter((w) => !bank.has(w));
  if (beyond.length < 20) return null;
  return {
    key: 'beyond',
    text: `${beyond.length} words in your lines have never been on a card.`,
  };
}

/**
 * How little of the bank has ever reached a line. The Feed's numbers all
 * point one way; this is the other side of the same fact, and it is always
 * worse than anyone would guess.
 */
async function bankUnused(lines: DailyLine[]): Promise<Observation | null> {
  const written = lines.filter((l) => SPACED.includes(l.languageCode));
  if (written.length < 60) return null;

  const mine = new Set<string>();
  for (const line of written) for (const w of words(line.text)) mine.add(w);

  const sets = await loadSets();
  const relevant = sets.filter((s) => s.kind === 'word');
  if (relevant.length < 100) return null;

  let used = 0;
  for (const set of relevant) {
    const hit = set.renderings.some(
      (r) => SPACED.includes(r.languageCode) && words(r.term).some((w) => mine.has(w))
    );
    if (hit) used += 1;
  }
  return {
    key: 'unused',
    text: `The bank holds ${relevant.length} words. ${used} of them have turned up in a line.`,
  };
}

/**
 * Days the line was the only thing. You would assume you write on the days
 * you study; the overlap is smaller than that, and the days that carry
 * nothing else are the ones that kept the habit alive.
 */
function lineAlone(lines: DailyLine[], sessionDays: Set<string>): Observation | null {
  if (lines.length < 40) return null;
  const alone = lines.filter((l) => !sessionDays.has(l.date)).length;
  if (alone < 10) return null;
  return {
    key: 'alone',
    text:
      alone === 1
        ? 'On 1 day the line was the only thing you did.'
        : `On ${alone} days the line was the only thing you did.`,
  };
}

/**
 * Whether the lines got longer. Reported in exactly the same words when they
 * get shorter — an observation that only fires in the flattering direction
 * has forfeited the right to be believed in the other.
 */
function lineLength(lines: DailyLine[]): Observation | null {
  const spaced = lines.filter((l) => SPACED.includes(l.languageCode));
  if (spaced.length < 60) return null;
  const byDate = [...spaced].sort((a, b) => a.date.localeCompare(b.date));
  const mean = (rows: DailyLine[]) =>
    Math.round(rows.reduce((sum, l) => sum + words(l.text).length, 0) / rows.length);
  const first = mean(byDate.slice(0, 30));
  const last = mean(byDate.slice(-30));
  if (first === 0 || last === 0) return null;
  const ratio = last / first;
  // Only when the move is large enough to be a fact rather than a wobble.
  if (ratio > 0.67 && ratio < 1.5) return null;
  return {
    key: 'length',
    text: `Your lines have gone from ${first} words to ${last}.`,
  };
}

// Deliberately absent: "the word that fought you longest", "never once
// missed", and every sibling of theirs. They are the most tempting
// observations available and they are all disqualified for the same reason —
// each is read off timesMissed / timesSeen, and saying one out loud tells
// you the app has been scoring your answers. api/check.ts spends its whole
// system prompt making sure the Check never reveals that grading exists;
// leaking it here through a paraphrase costs the same thing by a longer
// route. Sourcing it from Check transcripts instead of from state is the
// same leak with more steps, so that door is closed too.

/**
 * Every observation that currently clears its gate, most interesting first.
 * Exported so a caller can see there is more than one; `observation()` is
 * what screens actually use.
 */
export async function observations(): Promise<Observation[]> {
  try {
    const [lines, sessions] = await Promise.all([loadLines(), loadSessions()]);
    const today = localDay();
    const sessionDays = new Set(sessions.map((s) => s.date));
    const allDays = [...lines.map((l) => l.date), ...sessionDays];

    const found = await Promise.all([
      anniversary(lines, today),
      beyondTheBank(lines),
      bankUnused(lines),
      lineLength(lines),
      Promise.resolve(lineAlone(lines, sessionDays)),
      Promise.resolve(longestGap(allDays, today)),
    ]);
    return found.filter((o): o is Observation => o !== null);
  } catch {
    return [];
  }
}

/**
 * The one observation for today, or nothing. Rotates by day so it is not the
 * same sentence every time, but is stable within a day. An anniversary
 * always wins — it is the only one tied to the date rather than merely
 * available on it.
 */
export async function observation(): Promise<Observation | null> {
  const all = await observations();
  if (all.length === 0) return null;
  const dated = all.find((o) => o.key.startsWith('anniversary.'));
  if (dated) return dated;
  const dayIndex = Number(localDay().replaceAll('-', ''));
  return all[dayIndex % all.length];
}
