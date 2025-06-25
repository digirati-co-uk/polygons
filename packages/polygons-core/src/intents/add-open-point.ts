import type { Point } from '../polygon';
import type { ActionIntent, Modifiers, RenderState } from '../types';

export const addOpenPoint: ActionIntent = {
  type: 'add-open-point',
  label: 'Add point',
  tools: ['pen', 'line'],
  trigger: { type: 'click' },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (!state.isOpen) {
      return false;
    }

    if (state.polygon.points.length === 0) {
      return true;
    }

    if (state.selectedPoints.length !== 1) {
      return false;
    }

    if (state.polygon.points.length >= 2 && state.slowState.tools.line) {
      return false;
    }

    const selected = state.selectedPoints[0];
    return selected === 0 || selected === state.polygon.points.length - 1;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const pointer = state.line ? state.line[1] : pointers[0]!;
    const currentPoints = state.polygon.points;

    if (currentPoints.length === 0) {
      return {
        selectedPoints: [0],
        points: [pointers[0]!],
      };
    }

    if (modifiers.Shift) {
      // If we have 3 points currently, and they are all at 90 degrees, then we should
      // check if the point is close to the first point (x or y), and if so, close the shape.
      // @todo
    }

    const selected = state.selectedPoints[0];

    if (selected === 0) {
      return {
        selectedPoints: state.slowState.lineMode ? [] : [0],
        points: [pointer, ...currentPoints],
      };
    }

    state.line = null;

    return {
      selectedPoints: state.slowState.lineMode ? [] : [currentPoints.length],
      points: [...currentPoints, pointer],
    };
  },
};
