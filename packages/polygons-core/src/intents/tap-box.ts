import type { Point } from '../polygon';
import { resolvePoint } from '../snap-utils';
import type { ActionIntent, RenderState } from '../types';

export function tapBoxPoints(a: Point, b: Point, state: RenderState): Point[] {
  let dx = b[0] - a[0],
    dy = b[1] - a[1];
  if (state.slowState.fixedAspectRatio || state.slowState.modifiers.Shift) {
    const size = Math.min(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx) * size;
    dy = Math.sign(dy) * size;
  }
  return [a, [a[0], a[1] + dy], [a[0] + dx, a[1] + dy], [a[0] + dx, a[1]]];
}

export const tapBox: ActionIntent = {
  type: 'tap-box',
  label: 'Place box corner',
  tools: ['box'],
  trigger: { type: 'click' },
  isValid(_pointers, state) {
    return state.slowState.boxPlacement === 'tap' && (!state.polygon.points.length || state.slowState.canDelete);
  },
  commit(pointers, state, modifiers) {
    const point = resolvePoint(pointers[0], state, { disableSnap: modifiers.Shift });
    if (!state.boxPending) {
      state.boxPending = point;
      return;
    }
    const points = tapBoxPoints(state.boxPending, point, state);
    if (Math.abs(points[2][0] - points[0][0]) < state.scale || Math.abs(points[2][1] - points[0][1]) < state.scale)
      return;
    state.boxPending = null;
    return { points, isOpen: false, selectedPoints: [0, 1, 2, 3], tool: 'pointer' };
  },
};
