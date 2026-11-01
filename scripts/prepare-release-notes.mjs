import { readFile, writeFile } from 'node:fs/promises';

const [version, notesPath] = process.argv.slice(2);
if (!version || !notesPath || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
  throw new Error('Usage: node scripts/prepare-release-notes.mjs <version> <notes-file>');
}
const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
const existing = await readFile(changelogPath, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '# Changelog\n';
  throw error;
});
if (existing.split('\n').includes(`## ${version}`)) {
  throw new Error(`CHANGELOG.md already contains ${version}. Choose a new version bump.`);
}
const notes = (await readFile(notesPath, 'utf8')).trim();
const history = existing.replace(/^# Changelog\s*/, '').trim();
await writeFile(changelogPath, `# Changelog\n\n## ${version}\n\n${notes}\n${history ? `\n${history}\n` : ''}`);
