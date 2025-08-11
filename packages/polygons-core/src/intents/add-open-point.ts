import type { Point } from '../polygon';
import { applySnapToPointer, updateSnapState } from '../snap-utils';
import type { ActionIntent, Modifiers, RenderState } from '../types';

export const addOpenPoint: ActionIntent = {
  type: 'add-open-point',
  label: 'Add point',
  tools: ['pen', 'line', 'lineBox'],
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

    if (
      state.polygon.points.length >= 2 &&
      (state.slowState.currentTool === 'line' || state.slowState.currentTool === 'lineBox')
    ) {
      return false;
    }

    if (state.slowState.bounds) {
      // Check if outside of bounds ({x, y, width, height })
      const { x, y, width, height } = state.slowState.bounds;
      const [px, py] = pointers[0]!;
      if (px < x || px > x + width || py < y || py > y + height) {
        return false;
      }
    }

    const selected = state.selectedPoints[0];
    return selected === 0 || selected === state.polygon.points.length - 1;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    let pointer = state.line ? state.line[1] : pointers[0]!;
    if (!modifiers.Shift && state.slowState.snapEnabled) {
      updateSnapState(pointer, state, 3);
      pointer = applySnapToPointer(pointer, state);
    }

    const currentPoints = state.polygon.points;

    if (currentPoints.length === 0) {
      return {
        selectedPoints: [0],
        points: [pointer],
      };
    }

    if (modifiers.Shift) {
      // If we have 3 points currently, and they are all at 90 degrees, then we should
      // check if the point is close to the first point (x or y), and if so, close the shape.
      // @todo
    }

    const selected = state.selectedPoints[0];
    const lineMode = state.slowState.currentTool === 'line' || state.slowState.currentTool === 'lineBox';

    if (selected === 0) {
      // Check previous point.
      if (~~currentPoints[0][0] === ~~pointer[0] && ~~currentPoints[0][1] === ~~pointer[1]) {
        return {
          selectedPoints: [0],
          points: currentPoints,
        };
      }

      return {
        selectedPoints: lineMode ? [] : [0],
        points: [pointer, ...currentPoints],
      };
    }

    // Check next point.
    const lastPoint = currentPoints[currentPoints.length - 1];
    if (~~lastPoint[0] === ~~pointer[0] && ~~lastPoint[1] === ~~pointer[1]) {
      return {
        selectedPoints: [currentPoints.length - 1],
        points: currentPoints,
      };
    }

    state.line = null;

    return {
      selectedPoints: lineMode ? [] : [currentPoints.length],
      points: [...currentPoints, pointer],
    };
  },
};
