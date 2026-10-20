import { readdir, readFile, mkdir, writeFile, copyFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directories = ['src', 'public', 'schemas', 'fixtures', 'test', 'browser-test', 'scripts', 'docs', 'evidence'];
const top = ['package.json', 'package-lock.json', 'README.md', 'playwright.config.mjs', '.gitignore'];
if (existsSync(join(root, '.gitattributes'))) top.push('.gitattributes');
const siteDirectories = ['app', 'build', 'components', 'db', 'drizzle', 'hooks', 'lib', 'public', 'scripts', 'shared', 'test', 'browser-test', 'vendor', '.openai'];
const siteTop = ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'NOTICE', '.gitignore', '.npmrc', '.dev.vars.example', 'cloudflare-env.d.ts', 'components.json', 'drizzle.config.ts', 'eslint.config.mjs', 'next.config.ts', 'playwright.config.mjs', 'postcss.config.mjs', 'tsconfig.json', 'vite.config.ts', 'SHARED-SOURCE-MANIFEST.json'];
if (existsSync(join(root, 'judge-site', '.gitattributes'))) siteTop.push('.gitattributes');
for (const name of ['LICENSE', 'NOTICE']) if (existsSync(join(root, name))) top.push(name);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) throw new Error('Release inputs must not contain symlinks.');
    if (entry.isDirectory()) result.push(...await files(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

async function sourceManifest() {
  const list = top.map(name => join(root, name));
  for (const name of directories) list.push(...await files(join(root, name)));
  if (existsSync(join(root, 'judge-site'))) {
    for (const name of siteTop) list.push(join(root, 'judge-site', name));
    for (const name of siteDirectories) list.push(...await files(join(root, 'judge-site', name)));
  }
  const manifest = {};
  for (const full of list.sort()) {
    const name = relative(root, full).split(sep).join('/');
    if (/(?:^|\/)(?:\.env(?:\.|$)|node_modules|dist)|\.log$/i.test(name)) throw new Error('Forbidden release input.');
    manifest[name] = sha(await readFile(full));
  }
  return manifest;
}

export async function verifyBundle(destination, manifest) {
  const actual = (await files(destination)).map(file => relative(destination, file).split(sep).join('/')).filter(name => !['SOURCE-MANIFEST.json', 'DRAFT-NOT-FOR-SUBMISSION.txt'].includes(name)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest).sort())) throw new Error('Bundle file list does not match the approved source manifest.');
  for (const [name, expected] of Object.entries(manifest)) {
    if (sha(await readFile(join(destination, name))) !== expected) throw new Error(`Bundle differs from tested source: ${name}`);
  }
}

const manifest = await sourceManifest();
const sourceIdentity = sha(Buffer.from(JSON.stringify(manifest)));
if (process.argv.includes('--verify') && existsSync(join(root, 'SOURCE-MANIFEST.json'))) {
  const packaged = JSON.parse(await readFile(join(root, 'SOURCE-MANIFEST.json'), 'utf8'));
  if (packaged.source_identity_sha256 !== sourceIdentity || JSON.stringify(packaged.files) !== JSON.stringify(manifest)) throw new Error('Extracted source differs from its source manifest.');
  console.log(JSON.stringify({ status: 'extracted_source_manifest_match', source_identity_sha256: sourceIdentity, files: Object.keys(manifest).length }));
  process.exit(0);
}
const destination = join(root, 'dist', `rig-qa-desk-0.1.0-${sourceIdentity.slice(0, 12)}`);
if (!process.argv.includes('--verify')) {
  await mkdir(destination, { recursive: true });
  for (const name of Object.keys(manifest)) {
    const target = join(destination, name);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(join(root, name), target);
  }
  const verification = JSON.parse(await readFile(join(root, 'evidence/VERIFICATION-2026-10-12.json'), 'utf8'));
  await writeFile(join(destination, 'SOURCE-MANIFEST.json'), JSON.stringify({ schema_version: 1, source_identity_sha256: sourceIdentity, files: manifest, license_status: verification.source_license, real_nebius_inference: verification.real_nebius_inference }, null, 2));
  await writeFile(join(destination, 'DRAFT-NOT-FOR-SUBMISSION.txt'), await readFile(join(root, 'DRAFT-NOT-FOR-SUBMISSION.txt')));
}
await verifyBundle(destination, manifest);
console.log(JSON.stringify({ status: 'source_bundle_match', source_identity_sha256: sourceIdentity, bundle: destination, files: Object.keys(manifest).length }));
