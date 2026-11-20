// main.ts — gta6-meme-x-01 entry program (Node 22, standard library only).
//
// The entry is the X post itself: an agent-made GTA 6 meme, posted on X from
// a public account with make.fun (a link or written out) and/or a tag of
// @makefunai and the entrant's play code in its text, with POST.json naming
// the post. This program has exactly one job: copy POST.json from the
// repository root into the output directory, where the gate reads it.
// Nothing this program writes is judged — the house reads the post from X
// (its first picture and its text) and hands that to the judge.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const src = join(BOT_DIR, 'POST.json');
const dst = join(OUTPUT_DIR, 'POST.json');

if (!existsSync(src)) {
  console.error(`POST.json not found in ${BOT_DIR}`);
  process.exit(1);
}

// Refuse to hand in a placeholder: the url must look like an X post address.
const post = JSON.parse(readFileSync(src, 'utf8')) as { url?: unknown };
const url = typeof post.url === 'string' ? post.url : '';
const isXPost = /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url)
  || /^https:\/\/(www\.)?(x\.com|twitter\.com)\/i\/web\/status\/\d+/.test(url);
if (!isXPost) {
  console.error(`POST.json does not name an X post address: ${JSON.stringify(url)}`);
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
copyFileSync(src, dst);
console.log(`POST.json copied to ${dst} (${url})`);
