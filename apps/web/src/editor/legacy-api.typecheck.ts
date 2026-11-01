import type { MouseEventHandler } from 'react';
import { createHelper, type RenderState, type SlowState } from 'polygons-core';

// Existing hosts pass these methods directly as event handlers. The coordinate
// overloads must retain that assignment, as well as their original no-arg calls.
export function legacyApiTypecheck(helper: ReturnType<typeof createHelper>, legacyState: SlowState) {
  const down: MouseEventHandler<SVGSVGElement> = helper.pointerDown;
  const up: MouseEventHandler<SVGSVGElement> = helper.pointerUp;
  helper.pointerDown();
  helper.pointerUp();
  helper.clock.step(0);
  helper.setState(legacyState);
  const input: Parameters<typeof createHelper>[0] = {
    customSetState: (_partial: Partial<RenderState>) => {},
  };
  return { down, up, input };
}

// The state literal used by react-iiif-vault (also embedded by Manifest Editor).
export const legacySlowState: SlowState = {
  shapeId: null,
  noShape: true,
  transitioning: false,
  actionIntentType: null,
  transitionIntentType: null,
  selectedPoints: [],
  hasClosestLine: false,
  lastCreationTool: null,
  modifiers: {
    Alt: false,
    Shift: false,
    Meta: false,
    proximity: 0, // default value.
  },
  bounds: null,
  showBoundingBox: false,
  currentModifiers: {},
  validIntentKeys: {},
  pointerInsideShape: false,
  closestPoint: null,
  transitionModifiers: null,
  selectedStamp: null,
  bezierLines: [],
  boxMode: false,
  fixedAspectRatio: false,
  cursor: '',
  enabledTools: ['pointer', 'pen', 'box', 'lineBox', 'stamp', 'hand', 'line', 'pencil'],
  canDelete: true,
  canDeselect: true,
  isToolSwitchingLocked: false,
  currentTool: 'box',
  snapEnabled: false,
  snapToPoints: false,
  snapToLines: false,
  snapToIntersections: false,
  snapToGrid: false,
  snapToParallel: false,
};
