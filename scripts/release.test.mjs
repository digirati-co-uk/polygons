import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(t, script) {
  const root = mkdtempSync(join(tmpdir(), 'polygons-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL(script, import.meta.url), join(root, 'scripts', script));
  return { root, run: (...args) => execFileSync(process.execPath, [join(root, 'scripts', script), ...args]) };
}

test('release notes create a changelog even when the prepared version is unchanged', (t) => {
  const { root, run } = fixture(t, 'prepare-release-notes.mjs');
  const notes = join(root, 'notes.md');
  writeFileSync(notes, '## Changes\n\nPolygon editing improvements.\n');
  run('0.0.24', notes);
  assert.equal(
    readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
    '# Changelog\n\n## 0.0.24\n\n## Changes\n\nPolygon editing improvements.\n'
  );
});

test('release notes preserve previous versions and reject duplicate releases', (t) => {
  const { root, run } = fixture(t, 'prepare-release-notes.mjs');
  const notes = join(root, 'notes.md');
  const changelog = join(root, 'CHANGELOG.md');
  writeFileSync(changelog, '# Changelog\n\n## 0.0.23\n\nPrevious release.\n');
  writeFileSync(notes, 'New release.\n');
  run('0.0.24', notes);
  const result = readFileSync(changelog, 'utf8');
  assert.equal(result, '# Changelog\n\n## 0.0.24\n\nNew release.\n\n## 0.0.23\n\nPrevious release.\n');
  const duplicate = spawnSync(process.execPath, [join(root, 'scripts/prepare-release-notes.mjs'), '0.0.24', notes]);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr.toString(), /already contains 0.0.24/);
  assert.equal(readFileSync(changelog, 'utf8'), result);
});

test('release notes accept a prepared prerelease version', (t) => {
  const { root, run } = fixture(t, 'prepare-release-notes.mjs');
  const notes = join(root, 'notes.md');
  writeFileSync(notes, 'Preview changes.');
  run('0.1.0-beta.1', notes);
  assert.match(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), /## 0\.1\.0-beta\.1/);
});

test('README synchronization copies exact bytes and detects missing or stale npm docs', (t) => {
  const { root, run } = fixture(t, 'sync-readme.mjs');
  const target = join(root, 'packages/polygons-core/npm/README.md');
  mkdirSync(join(root, 'packages/polygons-core/npm'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Usage\n\nBézier curves.\n');
  const check = () => spawnSync(process.execPath, [join(root, 'scripts/sync-readme.mjs'), '--check']);
  assert.notEqual(check().status, 0);
  run();
  assert.equal(readFileSync(target, 'utf8'), '# Usage\n\nBézier curves.\n');
  assert.equal(check().status, 0);
  writeFileSync(target, 'Stale docs');
  assert.notEqual(check().status, 0);
});
