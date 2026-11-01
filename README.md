# polygon-editor

[![npm version](https://img.shields.io/npm/v/polygon-editor)](https://www.npmjs.com/package/polygon-editor)
[![Build and test](https://github.com/digirati-co-uk/polygons/actions/workflows/build-test.yml/badge.svg)](https://github.com/digirati-co-uk/polygons/actions/workflows/build-test.yml)
[![npm downloads](https://img.shields.io/npm/dm/polygon-editor)](https://www.npmjs.com/package/polygon-editor)
[![TypeScript declarations](https://img.shields.io/badge/TypeScript-declarations%20included-3178c6)](https://github.com/digirati-co-uk/polygons/blob/main/packages/polygons-core/src/types.ts)

A headless editor for polygons, polylines, points, boxes, and cubic Bézier curves. Use it to build annotation tools over images, maps, SVG, canvas, or IIIF viewers. It handles editing geometry, selection, snapping, draft gestures, and undo/redo. Your application supplies the rendering, toolbar, pointer events, and persistence.

The library has no React requirement. It ships ESM, CommonJS, and TypeScript declarations. The examples in this repository use React and SVG, including an Atlas deep-zoom viewer.

This guide covers the API in **0.0.24**. The npm badge shows the version currently published. If it shows an older version, the new commands below are available from this repository until the next npm release.

## Contents

- [Install and quick start](#install-and-quick-start)
- [Shapes and Bézier coordinates](#shapes-and-bézier-coordinates)
- [Connect a renderer and pointer events](#connect-a-renderer-and-pointer-events)
- [Tools and keyboard input](#tools-and-keyboard-input)
- [Commands and history](#commands-and-history)
- [Snapping, bounds, and units](#snapping-bounds-and-units)
- [Touch and reticle editing](#touch-and-reticle-editing)
- [State, callbacks, and events](#state-callbacks-and-events)
- [Examples and framework integration](#examples-and-framework-integration)
- [Compatibility and limitations](#compatibility-and-limitations)
- [Development](#development)
- [Releasing to npm](#releasing-to-npm)

## Install and quick start

```sh
npm install polygon-editor
# or: pnpm add polygon-editor
```

```ts
import { createHelper, type InputShape } from 'polygon-editor';

const helper = createHelper({ id: 'annotation-1', open: true, points: [], tool: 'pen' }, (shape: InputShape) => {
  // Persist committed geometry here. Drag previews are never saved.
  console.log(shape);
});

helper.addPointAt([40, 40]);
helper.addPointAt([240, 40]);
helper.addPointAt([140, 180]);
helper.finishShape(); // Close the triangle; at least 3 points are required.
helper.clock.flush(); // Deliver save/state/render callbacks once.
```

`createHelper(input, onSave)` manages one active shape. Pass existing geometry to edit it, an empty shape to start drawing, or `null` to disable editing until `helper.setShape(shape)` is called. `onSave` also runs for the initial shape and shape replacement when the clock processes them: treat it as a geometry notification, not exclusively as a user action. Keep server requests or expensive persistence debounced in your application.

Changes to the model are synchronous. Start the clock or flush it after input to deliver notifications and render updates. Multiple changes before a frame can be delivered together. Do not read draft geometry as saved geometry.

CommonJS is also supported:

```js
const { createHelper } = require('polygon-editor');
```

## Shapes and Bézier coordinates

```ts
import type { InputShape, Point } from 'polygon-editor';

const shape: InputShape = {
  id: 'optional-host-id',
  open: false,
  points: [
    [10, 10],
    [200, 10],
    [200, 150],
    [10, 150],
  ],
};
```

- `open: false` connects the last anchor back to the first; do not repeat the first anchor at the end.
- `open: true` is an open polyline, or a polygon still being drawn.
- A `Point` is `[x, y]` or `[x, y, c1dx, c1dy, c2dx, c2dy]`.
- Six-number points describe the **outgoing** cubic segment to the next anchor. Both control offsets are relative to this segment's starting anchor, including the second control. On an open shape, the last point has no outgoing segment.
- All coordinates are local world units: for an image editor, use image pixels before viewport zoom and pan.

For example, `[[10, 20, 30, -10, 70, -10], [110, 20]]` has controls at `[40, 10]` and `[80, 10]`. These are not the absolute control coordinates stored by an SVG `C` command.

Use a path renderer to preserve curves. This function handles both forms of `Point`:

```ts
import type { Point } from 'polygon-editor';

function pathData(points: Point[], open: boolean): string {
  if (!points.length) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  const segments = open ? points.length - 1 : points.length;
  for (let i = 0; i < segments; i++) {
    const p = points[i];
    const next = points[(i + 1) % points.length];
    d +=
      p.length === 6
        ? ` C ${p[0] + p[2]} ${p[1] + p[3]} ${p[0] + p[4]} ${p[1] + p[5]} ${next[0]} ${next[1]}`
        : ` L ${next[0]} ${next[1]}`;
  }
  return open ? d : `${d} Z`;
}
```

## Connect a renderer and pointer events

Register a render callback. Use `transitionPoints` for draft movement and `polygon.points` for committed geometry. A tap-box draft exists between taps even when `slow.transitioning` is false.

```ts
// svg and path are your existing SVGSVGElement and SVGPathElement.
helper.clock.set((state, slow, dt) => {
  path.setAttribute('d', pathData(state.transitionPoints ?? state.polygon.points, state.isOpen));
  path.setAttribute('fill', state.isOpen ? 'none' : 'rgba(0, 120, 255, 0.15)');
  path.setAttribute('stroke', '#0078ff');
  svg.style.cursor = slow.cursor;
  // dt is elapsed frame time. Render handles, selection, and guides here too.
});
helper.clock.flush();
```

The core does not attach DOM listeners. Convert client coordinates into the coordinate system of the shape, set the current scale, then supply pointer samples:

```ts
function worldPoint(event: PointerEvent): [number, number] {
  const matrix = svg.getScreenCTM();
  if (!matrix) throw new Error('SVG must be mounted before editing');
  const inverse = matrix.inverse();
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
  // Assumes uniform zoom. Use the shape group's CTM if it has another transform.
  helper.setScale(Math.hypot(inverse.a, inverse.b));
  return [p.x, p.y];
}

// In your pointerdown handler, after assigning the active pointer ID:
// helper.setPointerType(event.pointerType as 'mouse' | 'touch' | 'pen');
// svg.setPointerCapture(event.pointerId);
// helper.pointerDown(worldPoint(event));
// helper.clock.flush();

// In pointermove for that pointer (or mouse hover):
// helper.pointer([worldPoint(event)]);
// helper.clock.flush();

// In pointerup, supply the final position before releasing capture:
// helper.pointerUp(worldPoint(event));
// helper.clock.flush();
```

Your host must track pointer IDs and ignore unrelated edit samples. Cancel on `pointercancel`, unexpected lost capture, window blur, or a second contact. A normal release of capture after `pointerUp` should not cancel a pending two-tap box. For multiple contacts, cancel editing and suppress edit samples until **all** contacts lift; let the viewer handle navigation. Choose `touch-action` on the editing surface to match your host's navigation policy.

The complete [SVG event adapter](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/PolygonEditor.tsx) demonstrates pointer capture, contact tracking, cancellation, focus, and keyboard cleanup. Start there for a full interactive editor. The [overlay renderer](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/PolygonOverlay.tsx) also draws vertex handles, Bézier controls, bounding boxes, line/freehand previews, and snap guides.

Choose one clock strategy:

| Method                                | Use                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `clock.set(render)` + `clock.flush()` | Event-driven rendering; flush after input and toolbar commands. No animation loop is started. |
| `clock.start(render?, setState?)`     | Continuous animation frames; repeated calls do not start extra loops.                         |
| `clock.stop()`                        | Stop scheduling frames on unmount.                                                            |
| `clock.step(deltaTime?)`              | Legacy stepping API; it starts/sustains scheduling. Use `flush` for a single render.          |

On disposal, remove your event listeners, call `cancelGesture('unmount')`, reset modifiers, and stop the clock. If a render callback captures a component, replace it with a no-op when detaching.

## Tools and keyboard input

```ts
helper.tools.setTool('pen');
helper.tools.setTool('pointer');
helper.tools.setCanDelete(true);
helper.tools.setCanDeselect(true, false); // Allow deselection without selecting everything first.
```

| Tool      | Default key | Purpose                                                                              |
| --------- | ----------- | ------------------------------------------------------------------------------------ |
| `pointer` | V           | Select and move vertices, edit edges, and transform selected closed shapes.          |
| `pen`     | P           | Place polygon vertices and continue an open endpoint.                                |
| `line`    | N           | Place an open polyline.                                                              |
| `pencil`  | D           | Draw a freehand stroke.                                                              |
| `box`     | B           | Place a rectangle by dragging or by two taps.                                        |
| `lineBox` | L           | Construct a box from a line.                                                         |
| `stamp`   | S           | Place a predefined or custom shape.                                                  |
| `hand`    | H           | Move shape geometry; intercept input in the host if this tool should pan the viewer. |

Configure `enabledTools`, `toolMap` (uppercase shortcut keys), or `keyboardShortcutsEnabled` at construction. `tools.toggleTool`, `unsetTool`, `lockToolSwitching`, and `unlockToolSwitching` support toolbar modes. `tools.getToolInfo()` and `tools.getValidIntents()` expose contextual hints; `helper.label(intentType)` returns a human-readable intent label.

Forward `KeyboardEvent.key` to `helper.key.down(key)` and `helper.key.up(key)` from your focused editor. Prevent the browser default when `key.down` reports that it handled a key, then flush. Do not intercept keys in text fields. Control maps to Meta internally for undo/redo. `keyboardShortcutsEnabled: false` disables tool switching shortcuts; it does not disable every editing key.

Use `helper.modifiers.set('Shift')`, `unset('Shift')`, and `reset()` when your host manages modifiers separately. Sync Alt/Shift/Meta from pointer events if focus may have changed while a modifier was held. Reset modifiers and cancel the gesture on blur so keys cannot remain stuck. Shift constraints and Alt actions depend on the current intent; use `slowState.currentModifiers` and `transitionModifiers` for UI hints.

## Commands and history

Commands that return a boolean report whether the requested edit was applicable. Flush afterwards if using event-driven rendering.

| API                                            | Behavior                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `setShape(shape \| null)`                      | Replace the active shape, cancel drafts, and reset its history.                                                                              |
| `addPointAt([x, y])`                           | Place a vertex on an open pen/line shape.                                                                                                    |
| `finishShape({ close? })`                      | Close a polygon with at least 3 vertices, or finish an open line with at least 2. Defaults to open completion for `line`, closure otherwise. |
| `finishOpenShape(options?)`                    | Alias of `finishShape`; pass `{ close: false }` to explicitly keep a polyline open.                                                          |
| `undoLastPoint()`                              | Remove the active drawing endpoint, including a prepending pen endpoint.                                                                     |
| `selectAllPoints()` / `tools.clearSelection()` | Change selection without consuming geometry history.                                                                                         |
| `tools.smartSelect()`                          | Select an open endpoint or all vertices of a closed shape.                                                                                   |
| `moveSelectedPointTo([x, y])`                  | Move exactly one selected vertex.                                                                                                            |
| `nudge(dx, dy, { screenPixels? })`             | Move selected geometry; world units by default.                                                                                              |
| `cancelGesture(reason?)`                       | Discard the current draft without committing it.                                                                                             |
| `history.undo()` / `history.redo()`            | Restore geometry; pending gestures are cancelled first.                                                                                      |
| `history.canUndo` / `history.canRedo`          | Boolean getters for toolbar availability.                                                                                                    |
| `lockAspectRatio()` / `unlockAspectRatio()`    | Constrain bounding-box resizing.                                                                                                             |

`historyLimit` defaults to 100 snapshots, including the baseline. A new edit after undo discards the redo branch. Snap toggles and selection changes do not create geometry history entries.

### Curves

```ts
helper.setCurve(0, true); // Curve the outgoing segment of anchor 0.
helper.setBezierControl(0, 0, [60, 20]); // Control 0 (or 1), in absolute world coordinates.
helper.setCurveAt([0, 1], true); // Curve the segment between consecutive anchors.
helper.setCurveAt([1], true); // Smooth a vertex using its adjacent segments.
helper.smoothen([1]); // Recompute smooth handles at selected anchors.
helper.curveState([0, 1]); // { available, curved, anyCurved }
helper.canSmoothen([1]); // Whether smoothing would change this selection.
helper.clock.flush();
```

These commands participate in history. `smoothen()` defaults to the current selection. `doubleClick([x, y])` supports smoothing a nearby vertex. Control dragging uses the same preview/commit/cancel lifecycle as anchor dragging. Splitting a curve preserves its shape through cubic subdivision. Controls move with translation, scaling, rotation, and stamps.

### Stamps

```ts
helper.tools.setTool('stamp');
helper.stamps.hexagon(); // Also square(), triangle(), pentagon(), circle().
helper.stamps.set({
  open: false,
  points: [
    [0, 0],
    [100, 0],
    [50, 80],
  ],
});
helper.clock.flush();
```

Stamps are templates for placement; `stamps.clear()` removes the current template. The `box` tool uses the square template automatically.

## Snapping, bounds, and units

`setScale(value)` receives **world units per CSS pixel**, not viewport zoom. At 2× zoom, pass `0.5`; Atlas integrations pass `1 / runtime._lastGoodScale`. Do not include device pixel ratio. Invalid/non-positive values are ignored. Use uniform scaling for consistent hit targets.

| Setting                                                      | Units                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Shape geometry, command coordinates, bounds, grid spacing    | World units                                              |
| `proximity`, `touchProximity`, `dragThreshold`, `dragOffset` | CSS pixels                                               |
| `snap.setThreshold(value)` / `getThreshold()`                | CSS pixels, clamped to 5–50                              |
| `snap.getWorldThreshold()`                                   | Converted world units                                    |
| `nudge(dx, dy)`                                              | World units, or CSS pixels with `{ screenPixels: true }` |

```ts
helper.setBounds({ x: 0, y: 0, width: 1000, height: 800 });
helper.snap.enable();
helper.snap.setThreshold(15);
helper.snap.setGrid({ spacing: 20, origin: [0, 0] });
helper.snap.enableGrid();
helper.snap.setSources([
  {
    open: false,
    points: [
      [0, 0],
      [1000, 0],
      [1000, 800],
      [0, 800],
    ],
  },
]);
helper.clock.flush();
```

Bounds constrain committed anchors and group translation/nudge; they do not clip Bézier handles. Clear bounds with `setBounds(null)`. Snap source geometry is copied; replace it when other annotations change.

The snap API has `enable`, `disable`, `toggle`, and `enabled`, plus equivalent per-target methods: `enablePoints`, `disablePoints`, `togglePoints`, `pointsEnabled`, and the same pattern for `Lines`, `Curves`, `Intersections`, `Grid`, and `Parallel`. The `Parallel` mode means horizontal/vertical alignment, not arbitrary edge-angle parallelism.

Use `isActive()`, `getSnapPoint()`, `getActiveGuides()`, and `getTargets()` for feedback. `state.previewPoint` is the resolved placement position; draw a placement cross there instead of at the raw pointer. Open shapes have no phantom closing edge. Moving vertices exclude incident edges as snap targets. Shift limits snapping to curves, including when the global snap toggle is off; pen angle and point axis constraints still apply.

## Touch and reticle editing

```ts
const touchEditor = createHelper(
  {
    open: true,
    points: [],
    tool: 'box',
    pointerType: 'touch',
    boxPlacement: 'tap', // Default is 'drag'.
    proximity: 10, // Mouse/pen hit radius.
    touchProximity: 22, // Minimum touch hit radius.
    dragThreshold: 10, // Movement required to start a drag, independent of hit radius.
    dragOffset: [0, -48], // Lift a dragged handle above the finger, in CSS pixels.
    historyLimit: 100,
  },
  (shape) => console.log(shape)
);
```

Use `setPointerType`, `setBoxPlacement`, and `setDragOffset` to update these modes at runtime. A stationary long press remains a tap. A tap box stores its first corner as a draft; the second tap commits once and switches to the pointer tool. Cancel, tool changes, and shape replacement discard the pending box. `slowState.boxPending` is useful for “tap the second corner” instructions.

For a fixed-screen reticle, the host pans the image and computes the world coordinate underneath the reticle:

```ts
helper.setPointerOverride([300, 200]); // Drives preview and pointer-based placement.
helper.addPointAt([300, 200]); // Explicit toolbar placement command.
helper.nudge(1, -1, { screenPixels: true });
helper.setPointerOverride(null); // Return to normal pointer input.
helper.clock.flush();
```

Use `rawPointer` and `activeHandle` to render a host-owned loupe. The helper does not implement viewer pan/zoom, pointer capture, or a loupe. If `pointer()` receives multiple points it cancels editing; call `pointerUp()` after all contacts lift to reset that core multi-contact guard. The host must still own pointer IDs and navigation arbitration.

## State, callbacks, and events

Exported types include `CreateHelperInput`, `InputShape`, `Point`, `Polygon`, `RenderState`, `SlowState`, `RenderFunc`, `ValidTools`, `PointerType`, `BoxPlacement`, `SnapGrid`, `SnapGuide`, `SnapTarget`, and `PolygonEvents`.

`CreateHelperInput` accepts shape fields (`id`, `open`, `points`), `tool`, `enabledTools`, `fixedAspectRatio`, `bounds`, keyboard mappings, `emitter`, state callbacks, and the touch/history settings above. Default tool is `pointer`; tool shortcuts are enabled. `onStateChange(slowState)` is the correctly typed callback for UI state. Existing `customSetState` remains supported for legacy integrations; its historical `Partial<RenderState>` annotation does not accurately describe its slow-state payload, so prefer `onStateChange` in new code.

`helper.state` is mutable live state. Treat it as read-only; use commands to change geometry. Copy fields before storing a React state snapshot, and do not retain a frame object expecting it to remain immutable.

| State                                                   | Purpose                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| `polygon.points`, `isOpen`                              | Committed geometry. Persist through `onSave`. |
| `transitionPoints`, `transitionDraw`, `line`, `lineBox` | Draft geometry and tool previews.             |
| `transitionBoundingBox`, `selectionBox`                 | Resize/rotate and marquee previews.           |
| `selectedPoints`                                        | Selected anchor indices.                      |
| `pointer`, `rawPointer`, `previewPoint`, `activeHandle` | Input and resolved placement/drag feedback.   |
| `activeSnapGuides`, `snapPoint`, `isSnapping`           | Snap feedback.                                |
| `slowState.currentTool`, `cursor`, `currentModifiers`   | Toolbar, cursor, and contextual instructions. |
| `slowState.canUndo`, `canRedo`, `boxPending`            | History and two-tap placement UI.             |

Subscribe through the helper's mitt-compatible emitter (or pass your own `emitter` at construction):

```ts
const committed = ({ shape }: { shape: InputShape }) => console.log('Applied', shape);
helper.emitter.on('polygons.committed', committed);
// Later:
helper.emitter.off('polygons.committed', committed);
```

| Event                        | Timing                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `polygons.start-transition`  | A drag transition starts.                                        |
| `polygons.transition`        | A transition preview changes.                                    |
| `polygons.end-transition`    | Legacy event **before** applying the transition response.        |
| `polygons.committed`         | An edit response has been applied; includes the resulting shape. |
| `polygons.cancel-transition` | A gesture was cancelled; includes the reason.                    |

Use `onSave` for general geometry synchronization, including history and replacement. Use transition events for gesture UI. Do not treat `end-transition` as a post-commit notification.

## Examples and framework integration

- [React hook](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/use-polygon-editor.ts): instance lifetime, callback refs, copied render snapshots, external shape updates, and cleanup.
- [SVG editor](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/PolygonEditor.tsx) and [overlay](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/PolygonOverlay.tsx): complete input and rendering adapters.
- [Atlas / IIIF example](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/AtlasExample.tsx): canvas-local world events, inverse zoom, and an SVG portal with an explicit target.
- [Multiple annotations](https://github.com/digirati-co-uk/polygons/blob/main/apps/web/src/editor/AnnotationWorkbench.tsx): host-owned shapes and selection.

These source examples import the private workspace name `polygons-core`; use `polygon-editor` in your application. They are examples to adapt, not exported React components. Keep one helper per active editing session. Store the annotation collection in the host and use `setShape` when changing the active shape. Avoid feeding every unchanged `onSave` result back into `setShape`, which would reset history.

Run Storybook locally and open **Start here → Feature guide**. **Scenarios** provide hands-on polygon closure, box handles, selection, grid snapping, curves, portrait placement, multiple boxes, and live Bodleian/Wellcome IIIF examples. **Checks** contains scripted interaction regressions.

## Compatibility and limitations

The `createHelper(input, onSave)` signature, no-argument `pointerDown()` / `pointerUp()`, legacy state callbacks, tool strings, history, stamps, and clock methods remain available. Coordinate overloads and commands are additive. New state fields are optional so older TypeScript state literals remain compatible.

For 0.0.23 integrations upgrading to 0.0.24:

- `snap.getThreshold()` now returns the configured CSS-pixel threshold. Previously it multiplied by hit radius. Use `getWorldThreshold()` for the converted distance; remove any compensating multiplier in your UI.
- `clock.step()` retains scheduling behavior. Use the new `flush()` when you only want a single update.
- Model changes are synchronous; callbacks are delivered by the clock. Preserve `end-transition` ordering or switch post-commit listeners to `polygons.committed`.
- Update host pointer adapters to get cancellation and multi-touch navigation behavior. Installing the package alone cannot update a consumer's event handlers.

Curve hit testing and snapping approximate cubics with 32 straight pieces. Intersection guides use anchor segments, not exact curve intersections. Bounds apply to anchors rather than the complete curved outline. The older exported `createSvgHelpers` utilities use SVG point lists for several paths and do not provide a complete curve renderer; use the path approach above for six-number points. Exported low-level geometry/snap utilities with explicit distance thresholds use world units.

Physical iOS/Android testing remains necessary before shipping a mobile editor: browser touch emulation does not cover OS gestures, all capture interruptions, or real viewport behavior.

## Development

Use Node 22.12+ and the pinned pnpm 9 version (`corepack enable`). The published package lives in `packages/polygons-core/npm`; `polygons-core` is the private source workspace.

```sh
pnpm install --frozen-lockfile
pnpm --filter web exec playwright install chromium
pnpm storybook        # http://localhost:6006
pnpm --filter web dev # Vite playground; /atlas opens the viewer example
pnpm test             # Core regressions and Storybook interaction tests in Chromium
pnpm test:e2e         # Native mouse input and portrait touch via Playwright
pnpm test:iiif        # Live Bodleian/Wellcome tile loading, zoom, annotation alignment
pnpm test:release     # Release notes and README synchronization checks
pnpm build            # Library ESM/CJS/declarations and example application
pnpm build-storybook  # Static Storybook
pnpm docs:sync        # Copy this README into the npm package
pnpm docs:check       # Verify the package README matches exactly
```

The root README is the documentation source of truth. Commit both it and `packages/polygons-core/npm/README.md` after `pnpm docs:sync`. CI checks for drift; package `prepack` also copies the README before building. npm displays this same documentation after the next publication. Repository links are absolute so they work on npm too.

After building, compare a consumer's installed types with local declarations without changing its dependencies:

```sh
node scripts/check-consumer-types.cjs ../react-iiif-vault/tsconfig.json
node scripts/check-consumer-types.cjs ../iiif-manifest-editor/packages/editors/tsconfig.source.json
node scripts/check-consumer-types.cjs ../../stephenwf/theseus-workspace/packages/theseus-viewer/tsconfig.json
```

The checker separates existing diagnostics and fails on newly introduced ones. See the [review record](https://github.com/digirati-co-uk/polygons/blob/main/REVIEW.md) for consumer runtime tests and compatibility findings. Report issues with reproduction steps, the package version, pointer type, and relevant coordinate/scale settings in [GitHub Issues](https://github.com/digirati-co-uk/polygons/issues).

## Releasing to npm

### One-time trusted publisher setup

In the npm settings for **polygon-editor**, add a GitHub Actions trusted publisher with these exact values:

| Setting              | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Organization or user | `digirati-co-uk`                                                     |
| Repository           | `polygons`                                                           |
| Workflow filename    | `release.yml`                                                        |
| Environment          | Leave empty; the workflow does not declare an environment.           |
| Allow npm publish    | Enabled, to permit direct publishing from the release workflow.      |
| Allow npm dist-tag   | Not needed; this workflow does not run standalone dist-tag commands. |

The release job uses GitHub-hosted Ubuntu, Node 24, npm 11, and `id-token: write`. npm exchanges GitHub's OIDC identity for short-lived publish authorization. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required. The package's repository URL matches this public GitHub repository, allowing automatic provenance. Current npm requirements and setup details are in the [trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

New trusted publisher connections must complete their first successful publish within **two days** or expire. Recreate the connection if that window passes. Changes to the repository, workflow filename, or environment also require matching publisher configuration. Keep your npm account's 2FA enabled.

GitHub repository settings must allow Actions to create pull requests. The workflow requests `contents: write` and `pull-requests: write`; organization policies may further restrict these permissions.

### Create and merge a release PR

1. Push these workflows and the reviewed changes to `main` so Actions can run them.
2. Open **Actions → Create Release PR → Run workflow**, using `main`.
3. Choose `current` for the already-prepared **0.0.24**. For subsequent releases choose `patch`, `minor`, or `major`, or prepare a prerelease version manually and choose `current`.
4. Review the draft `release/next` PR. It updates the package version when requested and prepends GitHub-generated release notes to `CHANGELOG.md`. Its title and commit are `Release vX.Y.Z`.
5. Mark it ready and merge when reviewed. If checks are waiting because the PR was created by `GITHUB_TOKEN`, close and reopen it manually to trigger the ordinary PR workflows.
6. The release workflow verifies the exact merged commit using the Node 22/24 build-and-test matrix, then builds and publishes `polygon-editor`. It creates the matching `vX.Y.Z` tag and GitHub release after npm succeeds.

Stable versions publish to `latest`; versions containing a prerelease suffix publish to `next` and create a prerelease on GitHub. Update downstream exact version pins after publication.

A manual `vX.Y.Z` tag also triggers the same validation and publication path. The tag must match the nested npm `package.json` version. Do not merge a release PR and push a manual release tag for the same version: npm versions are immutable. Ordinary PR merges and local builds do not publish anything.

If publication fails, inspect the release run before retrying. Authentication failures usually mean a mismatched/expired publisher, an unapproved direct-publish permission, or an environment mismatch. If npm succeeded but GitHub release creation failed, create the GitHub release for that exact commit separately; re-running publication cannot overwrite the existing npm version.
