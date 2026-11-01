import type { Point } from '../polygon';
import { square } from '../shapes';
import { resolvePoint } from '../snap-utils';
import type { TransitionIntent } from '../types';

export const stampShape: TransitionIntent = {
  type: 'stamp-shape',
  label: 'Stamp shape',
  tools: ['stamp', 'box'],
  modifiers: { Shift: 'Maintain aspect ratio' },
  isValid(_pointers, state) {
    return !state.polygon.points.length || state.slowState.canDelete;
  },
  transition(pointers, state, modifiers) {
    if (!state.transitionOrigin) return;
    const stamp = state.slowState.selectedStamp || square;
    const xs = stamp.points.map((p) => p[0]),
      ys = stamp.points.map((p) => p[1]);
    const left = Math.min(...xs),
      top = Math.min(...ys);
    const width = Math.max(...xs) - left,
      height = Math.max(...ys) - top;
    if (!width || !height) return;
    const origin = resolvePoint(state.transitionOrigin, state, { disableSnap: modifiers.Shift });
    const target = resolvePoint(pointers[0], state, { disableSnap: modifiers.Shift });
    let dx = target[0] - origin[0],
      dy = target[1] - origin[1];
    if (modifiers.Shift || state.slowState.fixedAspectRatio) {
      const aspect = width / height;
      if (Math.abs(dx) > Math.abs(dy * aspect)) dy = (Math.sign(dy) || 1) * Math.abs(dx / aspect);
      else dx = (Math.sign(dx) || 1) * Math.abs(dy * aspect);
    }
    const bounds = state.slowState.bounds;
    if (bounds && (modifiers.Shift || state.slowState.fixedAspectRatio)) {
      const availableX = dx < 0 ? origin[0] - bounds.x : bounds.x + bounds.width - origin[0];
      const availableY = dy < 0 ? origin[1] - bounds.y : bounds.y + bounds.height - origin[1];
      const fit = Math.min(1, dx ? availableX / Math.abs(dx) : 1, dy ? availableY / Math.abs(dy) : 1);
      dx *= fit;
      dy *= fit;
    }
    state.activeHandle = [origin[0] + dx, origin[1] + dy];
    state.transitionPoints = stamp.points.map((p) => {
      const x = origin[0] + ((p[0] - left) * dx) / width;
      const y = origin[1] + ((p[1] - top) * dy) / height;
      return (
        p.length === 6
          ? [x, y, (p[2] * dx) / width, (p[3] * dy) / height, (p[4] * dx) / width, (p[5] * dy) / height]
          : [x, y]
      ) as Point;
    });
  },
  commit(_pointers, state) {
    if (!state.transitionPoints) return;
    return {
      isOpen: false,
      points: state.transitionPoints,
      selectedPoints: state.transitionPoints.map((_, i) => i),
      tool: 'pointer',
    };
  },
};
