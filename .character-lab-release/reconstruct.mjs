import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
const output = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile('.character-lab-release/manifest.json', 'utf8'));
for (const file of manifest.files) {
  if (!file.path.startsWith('character_lab/') || file.path.includes('..')) throw new Error('Invalid destination');
  let bytes;
  if (file.existing) bytes = await readFile(resolve(output, file.existingPath));
  else {
    const parts = await Promise.all(file.parts.map(path => readFile(path, 'utf8')));
    bytes = Buffer.from(parts.join(''), file.encoding === 'base64' ? 'base64' : 'utf8');
  }
  const hash = createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
  if (hash !== file.sha) throw new Error('Checksum mismatch: ' + file.path);
  const destination = resolve(output, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
await writeFile(resolve(output, 'character_lab/build-info.json'), JSON.stringify(manifest.verification, null, 2));
console.log('Verified all ' + manifest.files.length + ' release file checksums.');
