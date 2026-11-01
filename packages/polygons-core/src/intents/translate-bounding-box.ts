import { clampXYToBounds } from '../math';
import { resolvePoint, clearSnapState } from '../snap-utils';
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
    const bounds = state.slowState.bounds;
    // Each time, we need to translate by the same amount.
    const startingPoint = state.transitionOrigin!;
    const box = state.polygon.boundingBox!;
    const pointer = pointers[0];

    let [dx, dy] = clampXYToBounds(
      //
      pointer[0] - startingPoint[0],
      pointer[1] - startingPoint[1],
      box,
      bounds
    );

    if (modifiers.Shift || state.slowState.snapEnabled) {
      const candidates: Point[] = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ];
      const priorities = { point: 0, intersection: 1, grid: 2, parallel: 3, line: 4 };
      let best = Infinity;
      let bestPriority = Infinity;
      let bestProposal: Point | null = null;
      let correction: Point = [0, 0];
      for (const anchor of candidates) {
        const proposed: Point = [anchor[0] + dx, anchor[1] + dy];
        const target = resolvePoint(proposed, state, { disableSnap: modifiers.Shift });
        const distance = Math.hypot(target[0] - proposed[0], target[1] - proposed[1]);
        const candidate = state.snapTargets[0];
        const priority = candidate ? priorities[candidate.type] : Infinity;
        if (state.isSnapping && (priority < bestPriority || (priority === bestPriority && distance < best))) {
          bestPriority = priority;
          bestProposal = proposed;
          best = distance;
          correction = [target[0] - proposed[0], target[1] - proposed[1]];
        }
      }
      if (bestProposal) resolvePoint(bestProposal, state, { disableSnap: modifiers.Shift });
      const desiredX = dx + correction[0],
        desiredY = dy + correction[1];
      [dx, dy] = clampXYToBounds(desiredX, desiredY, box, bounds);
      if (dx !== desiredX || dy !== desiredY) clearSnapState(state);
    }

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
