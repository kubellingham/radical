// Drift: which language you are quietly losing.
//
// Every card shows all five languages at once, so the Feed can't tell them
// apart — it lights all of them or none. The Check is different: it asks for
// one language at a time, so a language you keep failing there, or that keeps
// not coming up, goes dark while the others stay lit. That gap is the whole
// signal, and it is the only thing in the app allowed to be seal red.
import { checkableLanguages, loadChecks } from './check';
import { languageByCode } from './languages';
import { localDay, loadSessions } from './repo';
import type { LanguageCode, LanguageConfig } from './types';

/** Below this, a quiet stretch is just a quiet stretch. */
const DARK_DAYS = 4;

export interface Drift {
  code: LanguageCode;
  name: string;
  daysDark: number;
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (!y1 || !y2) return 0;
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * The one language that has gone dark, or null. Never more than one: a page
 * with two warnings on it has no warning on it.
 *
 * Returns null until at least one Check exists — before that everything is
 * equally untested, and colouring one language at random would be a lie.
 */
export async function drifting(languages: LanguageConfig[]): Promise<Drift | null> {
  const codes = checkableLanguages(languages);
  if (codes.length === 0) return null;

  const checks = await loadChecks();
  if (checks.length === 0) return null;

  const today = localDay();
  // Nothing can be dark for longer than you have been checking.
  const firstCheck = checks.reduce((min, c) => (c.date < min ? c.date : min), checks[0].date);

  const lastLit = new Map<LanguageCode, string>();
  const lit = (code: LanguageCode, day: string) => {
    const current = lastLit.get(code);
    if (!current || day > current) lastLit.set(code, day);
  };

  // Holding it in the Check is what counts — being asked and half-missing
  // it is exactly the state this is meant to catch.
  for (const check of checks) {
    for (const verdict of check.verdicts) {
      if (verdict.result === 'solid') lit(verdict.languageCode, check.date);
    }
  }
  // Going out and capturing a word in a language counts too. That is the
  // language being used in the world, which beats being used in an app.
  for (const session of await loadSessions()) {
    if (session.languageCode) lit(session.languageCode, session.date);
  }

  let worst: Drift | null = null;
  for (const code of codes) {
    const daysDark = daysBetween(lastLit.get(code) ?? firstCheck, today);
    if (!worst || daysDark > worst.daysDark) {
      worst = { code, name: languageByCode(code)?.name ?? code, daysDark };
    }
  }
  return worst && worst.daysDark >= DARK_DAYS ? worst : null;
}

/** "Korean, 5 days dark." Flat, factual, one line. */
export function driftLine(drift: Drift): string {
  return `${drift.name}, ${drift.daysDark} ${drift.daysDark === 1 ? 'day' : 'days'} dark.`;
}
