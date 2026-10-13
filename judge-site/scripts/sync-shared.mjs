// Copy only the independently releasable companion modules below. A standalone
// site checkout verifies its committed snapshot and does not need a parent repo.
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const parentRoot = fileURLToPath(new URL('../../', import.meta.url));
const sharedRoot = join(siteRoot, 'shared');
const manifestPath = join(siteRoot, 'SHARED-SOURCE-MANIFEST.json');
const allowed = Object.freeze([
  'fixtures/encode.mjs', 'fixtures/workflow.mjs', 'public/workflow-visual.mjs',
  'schemas/advice.schema.json', 'schemas/inspection.schema.json',
  'src/inspect.mjs', 'src/recommend-core.mjs', 'src/workflow-visual.mjs',
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function boundedFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error('Shared source must be a bounded regular file.');
  return readFile(path);
}
async function listing(path, prefix = '') {
  const names = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) names.push(...await listing(join(path, entry.name), relative + '/'));
    else if (entry.isFile()) names.push(relative);
    else throw new Error('Shared source contains an unsupported filesystem entry.');
  }
  return names.sort();
}
async function verifySnapshot() {
  const rootInfo = await lstat(sharedRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Shared snapshot must be a regular directory.');
  const manifest = JSON.parse(await boundedFile(manifestPath));
  if (manifest.schema_version !== 1 || manifest.type !== 'rig-qa-shared-source'
    || Object.keys(manifest).sort().join(',') !== 'files,schema_version,type'
    || !Array.isArray(manifest.files) || manifest.files.length !== allowed.length) throw new Error('Invalid shared source manifest.');
  if (JSON.stringify(await listing(sharedRoot)) !== JSON.stringify(allowed)) throw new Error('Shared source snapshot contains missing or unexpected files.');
  for (const [index, entry] of manifest.files.entries()) {
    if (entry.path !== allowed[index] || Object.keys(entry).sort().join(',') !== 'bytes,path,sha256'
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid shared source manifest entry.');
    const bytes = await boundedFile(join(sharedRoot, entry.path));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error('Shared source snapshot does not match its manifest.');
  }
}
let parentAvailable = false;
try { parentAvailable = (await lstat(join(parentRoot, 'src/recommend-core.mjs'))).isFile(); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (parentAvailable && !process.argv.includes('--verify')) {
  // Read and validate the whole allowlist before writing any snapshot.
  const files = await Promise.all(allowed.map(async path => ({ path, contents: await boundedFile(join(parentRoot, path)) })));
  for (const file of files) {
    const destination = join(sharedRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.contents);
  }
  await writeFile(manifestPath, JSON.stringify({ schema_version: 1, type: 'rig-qa-shared-source', files: files.map(({ path, contents }) => ({ path, bytes: contents.length, sha256: sha256(contents) })) }, null, 2) + '\n');
}
await verifySnapshot();
process.stdout.write(`Shared source snapshot verified: ${allowed.length} allowlisted files.\n`);
