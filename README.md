# Polygons

A headless polygon editor, published as `polygon-editor`. The private workspace package is named `polygons-core`.

## Development and validation

Use Node 22.12+ and the pinned pnpm 9 version (`corepack enable`).

```sh
pnpm install --frozen-lockfile
pnpm --filter web exec playwright install chromium
pnpm storybook         # http://localhost:6006
pnpm --filter web dev  # Vite playground; /atlas shows the real viewer integration
pnpm test              # core regressions and Storybook interaction tests in Chromium
pnpm test:e2e          # trusted native mouse input and portrait touch via Playwright
pnpm test:iiif         # live Bodleian/Wellcome tile loading, zoom, and annotation alignment
pnpm build             # library ESM/CJS/declarations and example application
pnpm build-storybook   # static Storybook in apps/web/storybook-static
```

The React example uses one typed `usePolygonEditor` hook and one `PolygonOverlay` renderer. The plain SVG playground and Atlas example share them. The old duplicated Next.js pages have been replaced with the Vite application. Its `/atlas` route uses Atlas 3, canvas-local world events, and an SVG portal with an explicit target. The feature scenarios include live Bodleian and Wellcome IIIF services; regression fixtures remain independent of external image services.

Start with **Start here → Feature guide** in Storybook. **Scenarios** are hands-on examples with instructions and no autoplay: polygon closure, box handles, point selection, grid snapping, Bézier controls, portrait placement, a page of editable boxes, and live IIIF deep zoom. **Checks** contains the scripted regressions.

The inspector shows committed geometry, saved geometry, and live gesture/snap state. A draft must not appear in saved geometry. Stories cover fast releases, undo branches, tap boxes, touch hit targets, cancellation, second contacts, snapping, reticle commands, offsets, bounds, degenerate geometry, Bezier preservation, and Atlas input. Playwright additionally exercises browser pointer capture, OS-style touch cancellation, multiple real touch contacts, and offset Atlas canvases. The three desktop skips are touch-only tests which run in the portrait project.

Browser emulation does not replace physical iOS/Android testing. Before releasing mobile support, verify portrait Safari and Chrome, switching between one-finger editing and two-finger host navigation, interruption by OS gestures, zoom changes, and toolbar focus.

## Existing API

The existing `createHelper(input, onSave)` API, tool strings, state fields, history, modifiers, stamps, snapping controls, and clock methods remain available. New state fields are optional in TypeScript so existing `SlowState`/`RenderState` literals continue to compile. `Point` and `CreateHelperInput` are now exported.

```ts
import { createHelper } from 'polygon-editor';

const helper = createHelper({ open: true, points: [], tool: 'pen' }, (shape) => {
  // Save committed geometry. Drag previews are not saved.
});
helper.pointer([[120, 80]]);
helper.pointerDown();
helper.pointerUp();
```

Model changes are now synchronous. Subscriber notifications and `onSave` are delivered by the clock. A pointer press resolves its intent without waiting for a render frame, and a release uses the last supplied position. New overloads accept coordinates directly; the no-argument methods remain assignable as existing React event handlers.

```ts
helper.pointerDown([120, 80]);
helper.pointerUp([240, 160]);
helper.clock.flush(); // notify and render once; no animation loop
```

`clock.start()` is idempotent. `clock.step()` retains its legacy scheduling behavior for existing hosts. Use `clock.flush()` for an event-driven integration. `clock.stop()` stops the loop. Render `dt` is elapsed frame time. `onStateChange` is a correctly typed new slow-state callback; legacy `customSetState` remains supported.

`polygons.end-transition` retains its legacy ordering before response application. A listener that replaces the shape cannot have its replacement overwritten. New `polygons.committed` observes applied geometry; `polygons.cancel-transition` reports cancellation without a successful completion. Snap toggles and selection-only changes do not consume geometry history.

## Mobile additions

```ts
const helper = createHelper(
  {
    open: true,
    points: [],
    tool: 'box',
    pointerType: 'touch', // 'mouse' | 'touch' | 'pen'; set by the host
    boxPlacement: 'tap', // 'drag' remains the default
    dragOffset: [0, -48], // CSS pixels, applied during handle movement
    proximity: 10, // mouse/pen hit radius in CSS pixels
    touchProximity: 22, // touch hit-radius floor in CSS pixels
    dragThreshold: 10, // movement slop in CSS pixels, independent of hit radius
    historyLimit: 100, // includes the baseline
  },
  save
);

helper.setPointerType('touch');
helper.setBoxPlacement('tap');
helper.setDragOffset([0, -48]);
helper.cancelGesture('pointercancel');
helper.finishShape(); // closes a polygon; requires 3 vertices
helper.finishShape({ close: false }); // finishes an open polyline; requires 2
helper.finishOpenShape(); // alias of finishShape
helper.undoLastPoint();
helper.addPointAt([120, 80]);
helper.moveSelectedPointTo([125, 85]); // requires exactly one selected point
helper.setPointerOverride([300, 200]); // reticle position, in canvas-local world units
helper.setPointerOverride(null);
helper.nudge(1, -1, { screenPixels: true });
```

`finishShape` defaults to open-polyline completion for the line tool and polygon closure otherwise. Commands report whether they were applicable. `undoLastPoint` removes the active endpoint, including a prepending pen endpoint. Pointer overrides drive previews; the host pans its image and updates the world position beneath the fixed reticle. `rawPointer` and `activeHandle` supplement `RenderState.pointer` for host loupes and indicators. `previewPoint` is the resolved placement position, including before the first point: draw the placement cross and line endpoint there rather than at the raw pointer. `SlowState.cursor` reports tool, move, resize, rotate, close, and curve-control feedback for the host to apply.

Tap-box placement keeps the first corner and preview in a draft. The second tap commits once and switches to the normal pointer tool. `SlowState.boxPlacement` and `boxPending` drive hints. Cancel, tool changes, and shape replacement discard the pending box. A stationary long press remains a tap; movement, rather than a timeout, starts a drag.

The host owns pointer IDs, capture, event-to-world conversion, and navigation arbitration. Cancel on `pointercancel`, lost capture, or a second contact. Suppress edit samples until all contacts lift. The core also cancels when given more than one point in `pointer()`; call `pointerUp()` once the multi-contact gesture ends. The SVG example demonstrates this lifecycle. The loupe stays in the host.

## Units and snapping

All geometry and explicit command coordinates are canvas-local world units. `setScale()` receives **world units per CSS pixel** (the existing integrations pass `1 / runtime._lastGoodScale`). Do not multiply by device pixel ratio. Invalid or non-positive scales are ignored.

Hit radius, movement slop, drag offsets, and the configured snap threshold are CSS pixels, converted once through scale. Enlarging touch targets does not multiply bounding-box targets or change nudge distance. `snap.getThreshold()` now returns the configured pixel value; the previous getter multiplied it by the hit radius. `snap.getWorldThreshold()` exposes its converted value. This is a correction to the old demo's feedback loop, where decreasing the displayed threshold could increase the actual threshold.

```ts
helper.snap.enable();
helper.snap.setThreshold(15); // 5–50 CSS pixels
helper.snap.setSources([
  {
    open: false,
    points: [
      [0, 0],
      [600, 0],
      [600, 400],
      [0, 400],
    ],
  },
]);
helper.snap.setGrid({ spacing: 20, origin: [0, 0] }); // grid spacing is world units
helper.snap.enableGrid();
```

The shared resolver supports vertices, line segments, intersections, a grid, and the existing horizontal/vertical alignment behavior named `parallel`. It does not claim arbitrary edge-angle parallel snapping. External snap sources allow hosts to supply other annotations or canvas boundaries. Their geometry is copied; replace the sources when it changes. Existing exported utility calls with an explicit threshold continue to interpret that argument as world units.

Open shapes do not have a phantom closing edge. Moving vertices exclude their incident edges, split-line excludes its source edge, and exact matches remain targets. Handle snapping compensates for the grab offset. Shift disables snapping while retaining axis constraints. Disabling snapping, cancellation, tool changes, and shape replacement clear the active guides. Intersection searches are cached until geometry changes.

Bounds constrain committed anchors and group translation/nudge. Bezier control offsets survive movement/nudge and transform with scaling/rotation. Bézier controls have draggable amber handles and control arms. `helper.setCurve(pointIndex, enabled)` converts an outgoing segment between straight and cubic form; `helper.setBezierControl(pointIndex, control, worldPoint)` sets control 0 or 1 in world coordinates. These are additive commands with history support. Control dragging is a normal draft/commit/cancel transaction. Curve hit testing and line snapping still use anchor segments; snapping to the curved perimeter is not implemented.

## Release

The package is prepared as `polygon-editor@0.0.24`; nothing is published by local builds. Tag releases only after the CI unit, story, native-input, application, and package builds pass. Update the exact pins in downstream projects after publication. Manifest Editor and Theseus each have their own event adapters; upgrading the package alone does not install the new cancellation and touch-navigation handling in those applications.
