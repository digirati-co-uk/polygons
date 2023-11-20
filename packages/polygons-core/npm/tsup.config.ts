import { defineConfig, type Options } from 'tsup';

export default defineConfig((options: Options) => ({
  dts: true,
  outDir: '.',
  entry: ['../src/index.ts'],
  target: ['es2020'],
  minify: true,
  format: ['esm', 'cjs'],
  external: [],
  ...options,
}));
