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
