# Polygon review — 1 November 2026

Reviewed the uncommitted polygon core and Vite/Storybook rewrite against `d3d8278` (`0.0.23`), including the public API, gesture lifecycle, history, snapping, geometry, rendering adapters, package output, and CI/release configuration. The existing work is preserved separately in `a58eb15`; subsequent commits contain review fixes.

Checked the actual integration code in React IIIF Vault, Manifest Editor, and Theseus Viewer: helper construction, state callbacks, annotation requests, tool restrictions, direct mouse handlers, clock scheduling, transition events, stamps, SVG rendering, and scale conversion.

## Fixed findings

- **API compatibility:** `snapToCurves` was a new required `SlowState` field. Made it optional with the default preserved, and added Vault's real legacy state literal to the type-check fixture. `b42d326`
- **API compatibility:** the new `RenderState.boxPending` point conflicted with the boolean `SlowState.boxPending` when Vault merged `customSetState` into its store. Renamed the unpublished render field to `boxOrigin`, and added the actual merge pattern to the fixture. `fccc9bc`
- **Draft integrity:** Undo with no history left the first draft active; deleting during a drag could resurrect the deleted geometry on release; cancellation in a synchronous end listener could still apply the response. Fixed these paths and legacy Escape cancellation. `c62ec71`
- **Freehand geometry:** a fast stroke discarded its first coordinate and could close a one- or two-point shape. Prepending a stroke also reordered existing segments and detached curve controls. `e1ee210`
- **Bounds and resizing:** moving multiple selected vertices clipped them independently, changing their spacing between preview and commit. Fixed-ratio resizing also lost the offset between the pointer and grabbed corner. `5877fcc`
- **Idle performance:** newly allocated intent maps notified slow-state subscribers on every idle animation frame. Restored equality checking so unchanged frames retain the same state object. `e817fbd`
- **Selection:** closed polygons could not select the opposite endpoint independently; Shift marquee selection duplicated indices and could incorrectly enable whole-shape controls. `7dc7b5e`
- **Curve integrity:** reversing an outline on closure did not reverse its control ownership; click stamping discarded controls. `04074d9`
- **Curve integrity:** clicking to insert a point into a curved edge left its controls on only one half of the segment. Reused the drag subdivision logic. `3a70759`
- **Browser input:** focus or pointer capture lost before crossing the drag threshold left a press active. Added early cancellation while preserving normal two-tap box releases. `896bbf7`

Manifest Editor also has a separate compatibility fix, `d7f1802` on its existing `feature/i18n` branch: `SvgControlBar` now accepts the stamp API it actually uses instead of requiring every helper method. This allows helpers described by Vault's existing generated declarations to pass through when the polygon package adds methods. Its unrelated `apps/web/next-env.d.ts` change was preserved. React IIIF Vault and Theseus source and dependency pins were not changed.

## Verification

- `pnpm typecheck` passed, including legacy direct React handlers and callback/state fixtures.
- `pnpm test` passed: 108 core tests and 43 Storybook Chromium checks.
- `pnpm test:e2e` passed: 13 native desktop/portrait-input checks; the three desktop skips are touch-only cases covered by the portrait project.
- `pnpm test:iiif` passed both live Bodleian and Wellcome tile-loading, zoom, and annotation-alignment checks.
- `pnpm build` and `pnpm build-storybook` passed.
- Built ESM and CommonJS entry points passed import and editing smoke checks. `npm pack --dry-run --ignore-scripts` confirmed both runtime formats and both declaration formats are included.
- Consumer tests were run using temporary Vitest aliases to the built local `polygon-editor`, not their pinned published package: Vault's `annotation-pointer.test.tsx` (35), Theseus's `atlas-viewer/store.test.ts` (14), and Manifest Editor's `svg-controls.test.tsx` (2). Manifest's Vault dependency was inlined so the package alias applies inside it too.
- Compared each consumer's installed declarations against the local declarations using its own TypeScript configuration. No additional diagnostics: Vault retained 1 existing error, Manifest Editor's editors source configuration retained 42, and Theseus Viewer retained 76. This is compatibility evidence, not a claim that the consumer repositories type-check cleanly. `scripts/check-consumer-types.cjs` makes this comparison repeatable without changing dependencies or building the consumers.

## Scope and release notes

All three consumers still pin `0.0.23`; no package was published and no dependency upgrades were made. Their existing mouse integrations remain supported. The new touch-navigation cancellation contract still requires adoption in each host adapter; upgrading the package alone cannot add host pointer capture or navigation arbitration.

Curve hit-testing and snapping use a 32-piece approximation. Intersection targets still use anchor chords, so exact curved intersections are outside the current implementation. Physical mobile devices were not tested. Build output includes non-failing bundle-size warnings, and the Atlas Storybook test emits an existing React `act` warning.
