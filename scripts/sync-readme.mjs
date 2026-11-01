import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../README.md', import.meta.url);
const destination = new URL('../packages/polygons-core/npm/README.md', import.meta.url);
const readme = await readFile(source, 'utf8');
if (process.argv.includes('--check')) {
  const copy = await readFile(destination, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (copy !== readme) {
    throw new Error('The npm README is out of date. Run pnpm docs:sync and commit both README files.');
  }
} else {
  await writeFile(destination, readme);
}
