// A static file server for the game, so it is played from this repository the way it will be played
// from the grader's copy: game/ at the root of the site, no build step, no bundler, no network
// request. Standard library only. `node serve.ts --port 8091`, then open the address it prints.
// Types are mapped explicitly, because an ES module served as text/plain is refused by the browser.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const argv = process.argv.slice(2);
const portAt = argv.indexOf('--port');
const asked = Number(portAt === -1 ? process.env.PORT ?? 8080 : argv[portAt + 1]);
const port = Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

/** The file a request names, inside game/ and nowhere else. */
function target(pathname: string): string | null {
  const wanted = normalize(pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  const full = resolve(join(site, wanted));
  if (full !== site && !full.startsWith(site + sep)) return null;
  return full;
}

createServer(async (request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = target(pathname);
  if (!file) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(file);
    const wanted = info.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(wanted);
    response.writeHead(200, {
      'content-type': TYPES[extname(wanted).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`CONTAINER YARD is served from ${site}`);
  console.log(`  the game        http://localhost:${port}/`);
  console.log(`  a staged frame  http://localhost:${port}/?shot=firefight&seed=7&map=depot`);
});
