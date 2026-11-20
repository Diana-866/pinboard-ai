import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The backend address must exist in exactly one place.
 *
 * It did not: the approval desk carried its own copy of the production host next to an inline
 * `fetch`, so a deployment that changed the address (custom domain, staging, another region)
 * silently left that one upload aimed at the old server - the customer saw "the image could not be
 * replaced" while the request went somewhere else entirely. A per-component test cannot notice a
 * copy in a component nobody tested, so the rule is checked across the whole frontend.
 *
 * Deliberate exception: `lib/api.ts` owns the default. It is required to be there exactly once, so
 * the exception cannot rot into "the host is nowhere, and nobody noticed".
 */

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'lib/api.ts';
const EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build']);
const isTestFile = (path: string) => /\.test\.(ts|tsx)$/.test(path) || path.includes('.spec.');

/** Hosts a backend or a previous deployment is known by. */
const KNOWN_HOSTS = /(onrender\.com|herokuapp\.com|\.vercel\.app|\.netlify\.app)/;
/**
 * An API path, as the backend defines them. Components are free to reference images, SVG
 * namespaces and marketing links; what they must not do is build an API request themselves,
 * because that is how the upload lost its base URL, its deadline and its session handling.
 */
const API_PATH = /['"`]\/(?:pins|boards|projects|me|billing|credits|schedule|admin|auth|login|register|review-queue|analytics|health|ready)(?:[\/'"?`]|$)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) sourceFiles(full, out);
      continue;
    }
    if (EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

function sources() {
  return sourceFiles(SRC_ROOT)
    .map((path) => ({ relativePath: relative(SRC_ROOT, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
    .filter((entry) => !isTestFile(entry.relativePath));
}

function hostOccurrences(text: string): string[] {
  return text.split('\n').filter((line) => KNOWN_HOSTS.test(line));
}

test('the scanner sees the frontend sources', () => {
  const all = sources();
  assert.ok(all.length >= 20, `expected the frontend to have many sources, scanned ${all.length}`);
  assert.ok(all.some((entry) => entry.relativePath === OWNER), `${OWNER} must be scanned`);
});

test('the backend address lives in one file only', () => {
  const offenders: string[] = [];
  let ownerOccurrences = 0;

  for (const { relativePath, text } of sources()) {
    const lines = hostOccurrences(text);
    if (relativePath === OWNER) {
      ownerOccurrences = lines.length;
      continue;
    }
    for (const line of lines) {
      offenders.push(`${relativePath}: ${line.trim().slice(0, 90)}`);
    }
  }

  assert.equal(ownerOccurrences, 1, `${OWNER} must keep exactly one default address, found ${ownerOccurrences}`);
  assert.deepEqual(offenders, [], `backend addresses duplicated outside ${OWNER}:\n${offenders.join('\n')}`);
});

test('no component calls the API without the shared client', () => {
  // Components talk to the API only through lib/api.ts / lib/billing.ts. A `fetch` of an API path
  // inside a component is the shape that produced the defect - and it is what makes the deadline
  // and the session handling disappear without anybody noticing.
  const offenders: string[] = [];
  for (const { relativePath, text } of sources()) {
    if (relativePath.startsWith('lib/') || isTestFile(relativePath)) continue;
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (!/\bfetch\s*\(/.test(line)) return;
      // The call may be spread over several lines; look at the call and the next two lines.
      if (API_PATH.test(lines.slice(index, index + 3).join(' '))) {
        offenders.push(`${relativePath}: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `components calling the API without the shared client:\n${offenders.join('\n')}`);
});

test('the scanner rejects the shapes that caused the defect and accepts the fixed one', () => {
  // Self-check: the rules must fail for a copy of the host, a literal origin in a component and a
  // missing default in the owner, and pass for the shape used now.
  const classify = (relativePath: string, text: string) => {
    if (relativePath === OWNER) {
      const count = hostOccurrences(text).length;
      return count === 1 ? 'ok' : 'owner-must-hold-one';
    }
    if (hostOccurrences(text).length > 0) return 'duplicate-host';
    if (!relativePath.startsWith('lib/')) {
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (!/\bfetch\s*\(/.test(lines[index])) continue;
        if (API_PATH.test(lines.slice(index, index + 3).join(' '))) return 'direct-api-call';
      }
    }
    return 'ok';
  };

  assert.equal(classify('components/x.tsx', "const url = 'https://pinboard-ai-backend.onrender.com/pins';"), 'duplicate-host');
  assert.equal(classify('components/x.tsx', 'const url = `${base}/pins`;'), 'ok');
  assert.equal(classify('components/x.tsx', "await fetch(API + '/pins/' + id + '/image');"), 'direct-api-call');
  assert.equal(classify('components/x.tsx', "await fetch(\n    API_URL + '/boards/' + id,\n    opts\n  );"), 'direct-api-call');
  assert.equal(classify('components/x.tsx', "const logo = 'https://images.example-cdn.io/a.png';"), 'ok');
  assert.equal(classify('components/x.tsx', 'await uploadPinImage(pinId, file);'), 'ok');
  assert.equal(classify('lib/api.ts', 'const API_URL = "https://pinboard-ai-backend.onrender.com";'), 'ok');
  assert.equal(classify('lib/api.ts', 'const API_URL = import.meta.env.VITE_API_URL;'), 'owner-must-hold-one');
  assert.equal(classify('lib/billing.ts', 'const url = buildUrl(path);'), 'ok');
});
