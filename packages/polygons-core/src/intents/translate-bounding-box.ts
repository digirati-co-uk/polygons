import { type Point, precalculate, updateBoundingBox } from '../polygon';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

export const translateBoundingBox: TransitionIntent = {
  type: 'move-bounding-box',
  label: 'Move bounding box',
  tools: ['pointer'],
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    // When can you translate the bounding box?
    const size = state.polygon.points.length;
    const all = size === state.selectedPoints.length;
    const box = state.polygon.boundingBox;
    if (size < 1) {
      return false;
    }
    if (!all || !box) {
      return false;
    }

    // Check if the pointer is inside the bounding box
    const pointer = pointers[0];
    const x = pointer[0];
    const y = pointer[1];
    const inside = x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

    // Only inside the bounding box
    return inside;
  },

  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    // Each time, we need to translate by the same amount.
    const startingPoint = state.transitionOrigin!;
    const box = state.polygon.boundingBox!;
    const pointer = pointers[0];

    const dx = pointer[0] - startingPoint[0];
    const dy = pointer[1] - startingPoint[1];

    state.transitionPoints = state.polygon.points.map((point) => {
      if (point.length === 6) {
        return [point[0] + dx, point[1] + dy, point[2], point[3], point[4], point[5]];
      }
      return [point[0] + dx, point[1] + dy];
    });
    if (box) {
      state.transitionBoundingBox = {
        x: box.x + dx,
        y: box.y + dy,
        width: box.width,
        height: box.height,
      };
    }
  },

  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const points = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return {
      points,
    };
  },
};
