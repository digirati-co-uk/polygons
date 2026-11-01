// Compare a consumer's installed polygon-editor types with the local build,
// without changing its dependencies, emitting files, or hiding existing errors.
const path = require('node:path');
const { createRequire } = require('node:module');
const requireCore = createRequire(path.resolve(__dirname, '../packages/polygons-core/package.json'));
const ts = requireCore('typescript');
const declaration = path.resolve(__dirname, '../packages/polygons-core/npm/index.d.ts');
const configs = process.argv.slice(2);
if (!configs.length || !ts.sys.fileExists(declaration)) {
  console.error('Build polygons-core first, then pass one or more consumer tsconfig paths.');
  process.exit(1);
}

for (const input of configs) {
  const file = path.resolve(input);
  const loaded = ts.readConfigFile(file, ts.sys.readFile);
  if (loaded.error) throw Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(file));
  const options = { ...config.options, noEmit: true, incremental: false };
  function check(candidate) {
    const opts = candidate
      ? { ...options, paths: { ...options.paths, 'polygon-editor': [declaration] } }
      : options;
    const program = ts.createProgram(config.fileNames, opts);
    return [...config.errors, ...ts.getPreEmitDiagnostics(program)].map((diagnostic) => {
      const position = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null;
      return `${diagnostic.file?.fileName || file}:${position ? position.line + 1 : ''}:${diagnostic.code}: ${
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
    });
  }
  const baseline = new Set(check(false));
  const candidate = check(true);
  const added = candidate.filter((diagnostic) => !baseline.has(diagnostic));
  console.log(JSON.stringify({ config: file, baselineErrors: baseline.size, candidateErrors: candidate.length, added }, null, 2));
  if (added.length) process.exitCode = 1;
}
