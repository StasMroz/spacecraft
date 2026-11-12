/**
 * Writes packages/client/dist/versions.json for the Actions Pages deploy.
 *
 * The live site has only the latest build at /spacecraft/ (no frozen /vX.Y.Z/
 * folders). Entries are parsed from CHANGELOG.md; `path` points at the GitHub
 * Release for that tag so the menu's "Previous versions" links do not 404.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  path: string;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_REPO = 'StasMroz/spacecraft';

export function parseChangelog(md: string): { version: string; title: string }[] {
  const out: { version: string; title: string }[] = [];
  const re = /^## v([0-9]+(?:\.[0-9]+)*)\s*$/gm;
  const matches = [...md.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const version = m[1]!;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? md.length) : md.length;
    const body = md.slice(start, end);
    const bullet = body.split('\n').find((l) => l.trim().startsWith('- '));
    out.push({ version, title: compactTitle(bullet ? bullet.trim().slice(2) : `v${version}`) });
  }
  return out;
}

export function compactTitle(raw: string, max = 120): string {
  const text = raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function releasePath(repo: string, version: string): string {
  return `https://github.com/${repo}/releases/tag/v${version}`;
}

export function tagDate(version: string, cwd = ROOT): string | null {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', `v${version}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch {
    return null;
  }
}

export function repoSlug(cwd = ROOT): string {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const m = url.replace(/\.git$/, '').match(/github\.com[:/]([^/]+\/[^/]+)$/i);
    return m ? m[1]! : DEFAULT_REPO;
  } catch {
    return DEFAULT_REPO;
  }
}

export function buildVersionsJson(
  md: string,
  opts: { repo?: string; dates?: Record<string, string>; cwd?: string } = {},
): { versions: VersionEntry[] } {
  const repo = opts.repo ?? repoSlug(opts.cwd);
  const versions = parseChangelog(md).map((e) => ({
    version: e.version,
    date: opts.dates?.[e.version] ?? tagDate(e.version, opts.cwd) ?? '—',
    title: e.title,
    path: releasePath(repo, e.version),
  }));
  return { versions };
}

export function writeVersionsJson(
  outFile: string,
  mdFile = path.join(ROOT, 'CHANGELOG.md'),
  opts: { repo?: string; cwd?: string } = {},
): { versions: VersionEntry[] } {
  const md = fs.readFileSync(mdFile, 'utf8');
  const json = buildVersionsJson(md, opts);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2) + '\n');
  return json;
}

const here = fileURLToPath(import.meta.url);
const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === here;
if (isMain) {
  const out = path.join(ROOT, 'packages/client/dist/versions.json');
  const json = writeVersionsJson(out);
  console.log(`wrote ${out} (${json.versions.length} versions)`);
}
