import { distance } from '../math';
import type { Point } from '../polygon';
import type { ActionIntent } from '../types';

export const closeShape: ActionIntent = {
  type: 'close-shape',
  label: 'Close shape',
  tools: ['pen', 'line'],
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    if (!state.isOpen) {
      return false;
    }

    if (state.slowState.boxMode) {
      return false;
    }

    if (state.selectedPoints.length !== 1 || state.polygon.points.length < 2) {
      return false;
    }

    if (modifiers.Meta) {
      return false;
    }

    const selected = state.selectedPoints[0];
    if (selected === 0) {
      const lastPoint = state.polygon.points[state.polygon.points.length - 1];
      const dist = distance(pointers[0], lastPoint);
      return dist < modifiers.proximity;
    }
    if (selected === state.polygon.points.length - 1) {
      const firstPoint = state.polygon.points[0];
      const dist = distance(pointers[0], firstPoint);
      return dist < modifiers.proximity;
    }

    return false;
  },
  commit(pointers, state, modifiers) {
    const selected = state.selectedPoints[0];
    state.line = null;
    if (selected === 0) {
      // We need to reverse the points
      return {
        selectedPoints: [],
        points: state.polygon.points.slice().reverse().map((point, i): Point => {
          // Reversing a segment swaps its controls and moves their relative origin
          // to the other endpoint. The newly closing segment has no controls.
          const previous = state.polygon.points[state.polygon.points.length - 2 - i];
          return previous?.length === 6
            ? [point[0], point[1],
                previous[0] + previous[4] - point[0], previous[1] + previous[5] - point[1],
                previous[0] + previous[2] - point[0], previous[1] + previous[3] - point[1]]
            : [point[0], point[1]];
        }),
        isOpen: false,
      };
    } else if (selected === state.polygon.points.length - 1) {
      return {
        selectedPoints: [],
        isOpen: false,
      };
    }
  },
};
