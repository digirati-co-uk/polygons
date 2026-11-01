# Polygon interaction lab

See the root README for commands and the core API. Run `pnpm storybook` from the repository root, or `pnpm dev` here for the playground. `/atlas` exercises the real Atlas viewer.

- `src/editor/use-polygon-editor.ts`: typed model lifecycle, current callbacks, state snapshots, and explicit flushes.
- `src/editor/PolygonOverlay.tsx`: shared SVG rendering and snap guides.
- `src/editor/PolygonEditor.tsx`: native pointer capture, cancellation, world-coordinate conversion, touch/reticle controls, inspector.
- `src/editor/AtlasExample.tsx`: Atlas world-event adapter, viewport scale, canvas offsets, and portal target.
- `src/editor/Features.stories.tsx`, `AnnotationWorkbench.stories.tsx`, and `IIIF.stories.tsx`: user-facing scenarios, without autoplay.
- `src/editor/FeatureGallery.stories.tsx`: the starting guide.
- `src/editor/PolygonEditor.stories.tsx` and `AtlasExample.stories.tsx`: scripted regressions under Checks.
- `e2e/editor.spec.ts`: native mouse and portrait-touch tests against Storybook.
- `e2e/iiif.spec.ts`: optional live-service tests (`pnpm test:iiif` from the root), checking higher-resolution tiles after zoom and preserved annotation coordinates.

Live IIIF stories require access to their public image services. Standard CI uses the offline Atlas fixtures; live-service tests run separately so a service outage does not fail unrelated editor checks.
