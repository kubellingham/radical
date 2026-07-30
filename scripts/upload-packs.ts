/**
 * Upload reviewed packs to Supabase. Packs are shared content, written only
 * from here with the service role — clients have read-only access.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run packs:upload
 *
 * Re-running is safe: a pack with the same language/context/level is
 * replaced, and its version is bumped.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACK_DIR = join(process.cwd(), 'packs');

interface PackFile {
  language_code: string;
  context_tag: string;
  level: number;
  title: string;
  version: number;
  sort_order: number;
  items: { term: string; meaning: string }[];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role — never ship it).');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const files = readdirSync(PACK_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`No packs in ${PACK_DIR}. Generate some first.`);
    process.exit(1);
  }

  for (const file of files) {
    const pack = JSON.parse(readFileSync(join(PACK_DIR, file), 'utf8')) as PackFile;
    const bad = pack.items.filter((i) => !i.term?.trim() || !i.meaning?.trim());
    if (bad.length > 0) {
      console.error(`${file}: ${bad.length} items missing term or meaning — fix before uploading.`);
      process.exit(1);
    }

    const existing = await supabase
      .from('packs')
      .select('id, version')
      .eq('language_code', pack.language_code)
      .eq('context_tag', pack.context_tag)
      .eq('level', pack.level)
      .maybeSingle();
    if (existing.error) {
      console.error(`${file}: ${existing.error.message}`);
      process.exit(1);
    }

    const row = {
      language_code: pack.language_code,
      context_tag: pack.context_tag,
      level: pack.level,
      title: pack.title,
      payload: { items: pack.items },
      version: existing.data ? existing.data.version + 1 : pack.version,
      sort_order: pack.sort_order,
    };

    const res = existing.data
      ? await supabase.from('packs').update(row).eq('id', existing.data.id)
      : await supabase.from('packs').insert([row]);
    if (res.error) {
      console.error(`${file}: ${res.error.message}`);
      process.exit(1);
    }
    console.log(`${existing.data ? 'updated' : 'inserted'} ${file} (${pack.items.length} items)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
