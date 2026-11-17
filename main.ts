// CONTAINER YARD hands itself in here. The game is the sibling game/ directory: plain static files
// that a desktop browser loads with no build step and no network request. This program does three
// things and nothing else — it copies the game and the screenshots into the grader's output
// directory, and it writes the dossier the judge reads, using the vendored make.fun library
// unchanged. It runs on the grader's own Node with the standard library only, and it writes
// identical bytes on every run of the same tree, which is what the competition's two-run check
// compares.
//
// To play it locally: `node serve.ts --port 8091`, then open http://localhost:8091/
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for the grader's /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The repository this program belongs to: that is what it hands in. */
const root = fileURLToPath(new URL('.', import.meta.url));
/** The grader writes /output; outside it, MAKEFUN_OUTPUT_DIR says where to stand. */
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/**
 * The scorer's own caps, passed straight to buildDossier. Only text_max_bytes shapes the dossier's
 * bytes; the rest refuse an entry the scorer would refuse anyway — more than four screenshots or
 * one over 256 KiB, more than 993 entries under game/ or 48 MiB of game files in all, or a path
 * under game/ longer than 1000 bytes.
 */
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Every file under `dir`, as paths relative to `base`, in name order so two runs list the same. */
function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else if (entry.isFile()) files.push(relative(base, full));
  }
  return files;
}

/** Copy one directory of the repository into the output, and report what went over. */
function handIn(from, to, label) {
  if (!existsSync(from)) throw new Error(`nothing to hand in: ${from} is missing`);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  const files = walk(from);
  const bytes = files.reduce((total, file) => total + statSync(join(from, file)).size, 0);
  console.log(`${label}: ${files.length} file(s), ${bytes} bytes`);
  return files;
}

mkdirSync(output, { recursive: true });

const game = handIn(join(root, 'game'), join(output, 'game'), 'game/');
const shots = handIn(join(root, 'screenshots'), join(output, 'screenshots'), 'screenshots/');

if (!game.includes('index.html')) throw new Error('game/index.html is missing, so there is no game to play');
if (shots.length < 3) throw new Error(`screenshots/ holds ${shots.length} image(s); the entry needs three or four`);

const dossier = join(output, 'dossier.json');
writeFileSync(dossier, buildDossier(output, LIMITS));
console.log(`dossier.json: ${statSync(dossier).size} bytes`);
console.log(`handed in at ${output}`);
