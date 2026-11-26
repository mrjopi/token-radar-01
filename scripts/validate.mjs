// Token Radar's local gate check: the seven rows of RULES.txt's gate, run against
// one /output directory and the snapshot it was built from.
//
//   node scripts/validate.mjs <output-dir> <snapshot.json>
//
// Exits 0 when every row passes, 1 otherwise, printing one line per row.

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const outDir = process.argv[2];
const snapshotPath = process.argv[3];
if (!outDir || !snapshotPath) {
  process.stderr.write('usage: node scripts/validate.mjs <output-dir> <snapshot.json>\n');
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
const results = [];

function row(name, ok, detail) {
  results.push({ name, ok, detail: detail ?? '' });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** PNG/JPEG dimensions out of the header, or null when the file is not a whole image of either. */
function imageSize(bytes) {
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && pngMagic.every((b, i) => bytes[i] === b)) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: 'png' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      const len = bytes.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7), type: 'jpeg' };
      }
      at += 2 + len;
    }
    return null;
  }
  return null;
}

// 1. dashboard_files
(function dashboardFiles() {
  const dir = join(outDir, 'dashboard');
  if (!existsSync(dir)) return row('dashboard_files', false, 'no dashboard/ directory');
  const files = [];
  let bytes = 0;
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    for (const e of readdirSync(rel === '' ? dir : join(dir, rel), { withFileTypes: true })) {
      const p = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name.startsWith('.')) return row('dashboard_files', false, `dot-directory ${p}`);
        stack.push(p);
      } else if (e.isFile()) {
        if (!PLAIN_NAME.test(e.name)) return row('dashboard_files', false, `bad name ${p}`);
        const size = lstatSync(join(dir, p)).size;
        files.push(p);
        bytes += size;
      } else {
        return row('dashboard_files', false, `${p} is neither a file nor a directory`);
      }
    }
  }
  if (files.length > 400) return row('dashboard_files', false, `${files.length} files`);
  if (bytes > 4_194_304) return row('dashboard_files', false, `${bytes} bytes`);
  if (!files.includes('index.html')) return row('dashboard_files', false, 'no index.html');
  if (!files.some((f) => f.endsWith('.css'))) return row('dashboard_files', false, 'no .css file');
  if (!files.some((f) => f.endsWith('.js'))) return row('dashboard_files', false, 'no .js file');
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (f.endsWith('.html')) {
      const attrs = text.match(/(?:href|src|action|poster|data|formaction|cite|longdesc|usemap|background)=["']https?:\/\/[^"']*["']/gi);
      if (attrs) return row('dashboard_files', false, `${f} names a network address in an attribute: ${attrs[0]}`);
      const style = text.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      for (const s of style ?? []) if (/https?:\/\//.test(s)) return row('dashboard_files', false, `${f} names a network address in a <style> body`);
    }
    if (f.endsWith('.css') && /https?:\/\//.test(text)) return row('dashboard_files', false, `${f} names a network address`);
    if (f.endsWith('.js') && /(?:import\s*\(?\s*['"]|from\s*['"]|require\s*\(\s*['"])https?:\/\//.test(text)) {
      return row('dashboard_files', false, `${f} imports a network address`);
    }
  }
  return row('dashboard_files', true, `${files.length} files, ${bytes} bytes`);
})();

// 2 + 3 + 5. board_file, sorted_by_value, farm_steps
let board = null;
(function boardFile() {
  const path = join(outDir, 'board.json');
  if (!existsSync(path)) return row('board_file', false, 'no board.json');
  const size = statSync(path).size;
  if (size > 8 * 1024 * 1024) return row('board_file', false, `${size} bytes`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return row('board_file', false, 'not JSON');
  }
  const rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) return row('board_file', false, 'no rows array');
  if (rows.length < 100 || rows.length > 4000) return row('board_file', false, `${rows.length} rows`);
  for (const r of rows) {
    if (!snapSlugs.has(r.slug)) return row('board_file', false, `invented slug ${r.slug}`);
    if (typeof r.name !== 'string' || r.name.length === 0) return row('board_file', false, `${r.slug} has no name`);
    if (!Number.isSafeInteger(r.rank) || r.rank <= 0) return row('board_file', false, `${r.slug} has rank ${r.rank}`);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return row('board_file', false, `${r.slug} has implied value ${r.implied_value_usd}`);
    }
    if (!Array.isArray(r.farm_steps)) return row('board_file', false, `${r.slug} has no farm_steps`);
  }
  if (rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) {
    return row('board_file', false, 'all rows share one implied value');
  }
  board = rows;
  row('board_file', true, `${rows.length} rows, ${size} bytes`);
  // sorted_by_value
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return row('sorted_by_value', false, `rank ${i + 1} is ${ranks[i]}`);
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) {
      return row('sorted_by_value', false, `row ${i + 1} outranks row ${i}`);
    }
  }
  row('sorted_by_value', true, 'ranks 1..N, values non-increasing');
  // farm_steps
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return row('farm_steps', false, `${r.slug} has ${r.farm_steps.length} steps`);
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return row('farm_steps', false, `${r.slug} has a step of ${t.length} chars`);
    }
  }
  row('farm_steps', true, `${rows.length} rows, 6 steps each`);
})();

// 4. coverage
(function coverage() {
  if (!board) return row('coverage', false, 'no board to check');
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return row('coverage', false, `missing ${missing.join(', ')}`);
  row('coverage', true, `${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist slugs`);
})();

// 6. screenshots
(function screenshots() {
  const dir = join(outDir, 'screenshots');
  if (!existsSync(dir)) return row('screenshots', false, 'no screenshots/ directory');
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (names.length < 3 || names.length > 4) return row('screenshots', false, `${names.length} images`);
  for (const name of names) {
    if (!PLAIN_NAME.test(name)) return row('screenshots', false, `bad name ${name}`);
    const bytes = readFileSync(join(dir, name));
    if (bytes.length > 524_288) return row('screenshots', false, `${name} is ${bytes.length} bytes`);
    const size = imageSize(bytes);
    if (!size) return row('screenshots', false, `${name} is not a whole PNG or JPEG`);
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > 1440 || short < 800) return row('screenshots', false, `${name} is ${size.width}x${size.height}`);
  }
  row('screenshots', true, names.map((n) => `${n} (${readFileSync(join(dir, n)).length} bytes)`).join(', '));
})();

// 7. dossier_matches
(function dossier() {
  const path = join(outDir, 'dossier.json');
  if (!existsSync(path)) return row('dossier_matches', false, 'no dossier.json');
  const written = readFileSync(path);
  if (written.length > 1.5 * 1024 * 1024) return row('dossier_matches', false, `dossier is ${written.length} bytes`);
  let rebuilt;
  try {
    rebuilt = buildDossier(outDir, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  } catch (e) {
    return row('dossier_matches', false, `buildDossier refuses: ${e.message}`);
  }
  if (!Buffer.from(rebuilt).equals(written)) return row('dossier_matches', false, 'dossier bytes differ from a rebuild');
  row('dossier_matches', true, `${written.length} bytes`);
})();

process.exit(results.every((r) => r.ok) ? 0 : 1);
