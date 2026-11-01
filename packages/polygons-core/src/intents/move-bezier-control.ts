import type { Point } from '../polygon';
import { clampPoint } from '../snap-utils';
import type { RenderState, TransitionIntent } from '../types';

export function nearestBezierControl(
  pointer: Point,
  state: RenderState,
  radius: number
): { pointIndex: number; control: 0 | 1 } | null {
  let nearest: { pointIndex: number; control: 0 | 1 } | null = null;
  let best = radius * radius;
  state.polygon.points.forEach((point, pointIndex) => {
    if (point.length !== 6 || (state.isOpen && pointIndex === state.polygon.points.length - 1)) return;
    for (const control of [0, 1] as const) {
      const index = 2 + control * 2;
      const distance = (pointer[0] - point[0] - point[index]) ** 2 + (pointer[1] - point[1] - point[index + 1]) ** 2;
      if (distance < best) {
        best = distance;
        nearest = { pointIndex, control };
      }
    }
  });
  return nearest;
}

export const moveBezierControl: TransitionIntent = {
  type: 'move-bezier-control',
  label: 'Move curve control',
  modifiers: { Shift: 'Snap angle', Alt: 'Move this handle only' },
  tools: ['pointer', 'pen'],
  isValid(pointers, state, modifiers) {
    // With the whole shape selected (bounding box showing) the handles are hidden, so they can't be grabbed.
    if (state.slowState.showBoundingBox) return false;
    return !!nearestBezierControl(pointers[0], state, modifiers.proximity);
  },
  start(pointers, state, modifiers) {
    state.activeBezierControl = nearestBezierControl(pointers[0], state, modifiers.proximity);
    if (state.activeBezierControl) return { selectedPoints: [state.activeBezierControl.pointIndex] };
  },
  transition(pointers, state, modifiers) {
    const selected = state.activeBezierControl;
    if (!selected || !state.transitionOrigin) return;
    const point = state.polygon.points[selected.pointIndex];
    if (point.length !== 6) return;
    const index = 2 + selected.control * 2;
    // Control 0 hangs off its own point; control 1 hangs off the next point along the segment.
    const anchor =
      selected.control === 0 ? point : state.polygon.points[(selected.pointIndex + 1) % state.polygon.points.length];
    let target = clampPoint(
      [
        point[0] + point[index] + pointers[0][0] - state.transitionOrigin[0],
        point[1] + point[index + 1] + pointers[0][1] - state.transitionOrigin[1],
      ],
      state
    );
    if (modifiers.Shift) {
      // Like rotation: Shift snaps the handle's angle to 15° steps, keeping its length.
      const dx = target[0] - anchor[0],
        dy = target[1] - anchor[1];
      const length = Math.hypot(dx, dy);
      const step = Math.PI / 12;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      target = clampPoint([anchor[0] + Math.cos(angle) * length, anchor[1] + Math.sin(angle) * length], state);
    }
    const changed = [...point] as Point;
    changed[index] = target[0] - point[0];
    changed[index + 1] = target[1] - point[1];
    const points = state.polygon.points.map((p, i) => (i === selected.pointIndex ? changed : p));
    if (!modifiers.Alt) {
      // By default mirror the drag (Alt moves just this handle): the handle on the other side of the same
      // anchor becomes the exact opposite of the dragged one, so it stays collinear and the same length.
      const n = points.length;
      const open = state.isOpen;
      const anchorIndex = selected.control === 0 ? selected.pointIndex : (selected.pointIndex + 1) % n;
      // Control 0 hangs off its point, so the opposite is the previous point's second control (and vice versa).
      const ownerIndex = selected.control === 0 ? (selected.pointIndex - 1 + n) % n : anchorIndex;
      const ownerIndexValid = selected.control === 0 ? !open || selected.pointIndex > 0 : !open || anchorIndex < n - 1;
      const owner = points[ownerIndex];
      const oppositeSlot = selected.control === 0 ? 4 : 2;
      if (ownerIndexValid && ownerIndex !== selected.pointIndex && owner.length === 6) {
        const anchorPoint = points[anchorIndex];
        const vx = target[0] - anchorPoint[0],
          vy = target[1] - anchorPoint[1];
        const dragged = Math.hypot(vx, vy);
        if (dragged > 1e-9) {
          const moved = [...owner] as Point;
          moved[oppositeSlot] = anchorPoint[0] - vx - owner[0];
          moved[oppositeSlot + 1] = anchorPoint[1] - vy - owner[1];
          points[ownerIndex] = moved;
        }
      }
    }
    state.transitionPoints = points;
    state.activeHandle = target;
    state.transitionBezierLine = [[anchor[0], anchor[1]], target];
  },
  commit(_pointers, state) {
    return { points: state.transitionPoints || state.polygon.points };
  },
};
