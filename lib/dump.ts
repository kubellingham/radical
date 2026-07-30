import { supabase } from './supabase';
import type { DraftItem, LanguageCode } from './types';

// On web the function is same-origin; native builds need the absolute URL.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

interface WireItem {
  language_code: LanguageCode;
  term: string;
  reading: string;
  meaning: string;
  example: string;
  example_meaning: string;
  context_tag: DraftItem['contextTag'];
  sino_root: string;
}

export interface ParseResult {
  items: DraftItem[];
  /** False when the AI parser was unreachable and the local one stood in. */
  remote: boolean;
}

export async function parseDump(text: string): Promise<ParseResult> {
  try {
    // The endpoint spends the owner's Anthropic credit, so it requires the
    // Supabase session token. Signed out or local-only → parse locally.
    if (!supabase) throw new Error('local-only');
    const { data: auth } = await supabase.auth.getSession();
    const token = auth.session?.access_token;
    if (!token) throw new Error('no session');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(`${API_BASE}/api/dump`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = (await response.json()) as { items: WireItem[] };
    const items = data.items.map(fromWire).filter((i) => i.term.length > 0);
    if (items.length === 0) throw new Error('empty parse');
    return { items, remote: true };
  } catch {
    return { items: heuristicParse(text), remote: false };
  }
}

function fromWire(w: WireItem): DraftItem {
  return {
    languageCode: w.language_code,
    term: (w.term ?? '').trim(),
    reading: (w.reading ?? '').trim(),
    meaning: (w.meaning ?? '').trim(),
    example: (w.example ?? '').trim(),
    exampleMeaning: (w.example_meaning ?? '').trim(),
    contextTag: w.context_tag ?? '',
    sinoRoot: (w.sino_root ?? '').trim(),
  };
}

// Offline / unconfigured fallback: split lines and pull apart the common
// "term means meaning" / "term = meaning" / "term - meaning" shapes.
// Language is guessed from the script. Crude on purpose — everything is
// editable on the confirmation screen.
const SEPARATORS = [/\s+means\s+/i, /\s*=\s*/, /\s+-\s+/, /\s*[—–]\s*/, /\s*:\s*/];

export function heuristicParse(text: string): DraftItem[] {
  const lines = text
    .split(/\n|[;,]\s+|\s+and\s+(?=\S)/)
    .map((l) => l.replace(/^(learned|learnt|new word:?|today:?|and|also)\s+/i, '').trim())
    .filter((l) => l.length > 0);

  const items: DraftItem[] = [];
  for (const line of lines) {
    let term = line;
    let meaning = '';
    for (const sep of SEPARATORS) {
      const parts = line.split(sep);
      if (parts.length >= 2 && parts[0].trim().length > 0) {
        term = parts[0].trim();
        meaning = parts.slice(1).join(' ').trim();
        break;
      }
    }
    term = term.replace(/^["'“”]|["'“”]$/g, '');
    if (term.length === 0) continue;
    items.push({
      languageCode: guessLanguage(term),
      term,
      reading: '',
      meaning,
      example: '',
      exampleMeaning: '',
      contextTag: '',
      sinoRoot: '',
    });
  }
  return items;
}

export function guessLanguage(term: string): LanguageCode {
  if (/[぀-ヿ]/.test(term)) return 'ja'; // kana
  if (/[가-힯ᄀ-ᇿ]/.test(term)) return 'ko'; // hangul
  if (/[一-鿿]/.test(term)) return 'zh'; // hanzi only, no kana seen
  if (/[Ѐ-ӿ]/.test(term)) return 'ru'; // cyrillic
  return 'es';
}
