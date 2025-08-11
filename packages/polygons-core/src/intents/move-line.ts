import { clampXYToBounds } from '../math';
import type { TransitionIntent } from '../types';

export const moveLine: TransitionIntent = {
  type: 'move-line',
  label: 'Move line',
  tools: ['line'],
  isValid(pointers, state, modifiers) {
    if (state.slowState.currentTool !== 'line') {
      return false;
    }
    if (state.slowState.boxMode) {
      return false;
    }

    if (state.closestLinePoint && state.closestLineDistance < modifiers.proximity) {
      return true;
    }

    return false;
  },
  transition(pointers, state) {
    const startingPoint = state.transitionOrigin!;
    const box = state.polygon.boundingBox!;
    const pointer = pointers[0];

    const [dx, dy] = clampXYToBounds(
      //
      pointer[0] - startingPoint[0],
      pointer[1] - startingPoint[1],
      state.slowState.bounds,
    );

    state.transitionPoints = state.polygon.points.map((point) => {
      if (point.length === 6) {
        return [point[0] + dx, point[1] + dy, point[2], point[3], point[4], point[5]];
      }
      return [point[0] + dx, point[1] + dy];
    });
  },
  commit(pointers, state, modifiers) {
    const points = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return {
      points,
    };
  },
};
