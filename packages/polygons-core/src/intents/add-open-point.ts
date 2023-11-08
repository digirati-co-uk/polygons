import { ActionIntent, Modifiers, RenderState } from '../types';
import { Point } from '../polygon';

export const addOpenPoint: ActionIntent = {
  type: 'add-open-point',
  label: 'Add point',
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

    const selected = state.selectedPoints[0];
    return selected === 0 || selected === state.polygon.points.length - 1;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const pointer = pointers[0]!;
    const currentPoints = state.polygon.points;

    if (currentPoints.length === 0) {
      return {
        selectedPoints: [0],
        points: [pointer],
      };
    }

    const selected = state.selectedPoints[0];

    if (selected === 0) {
      return {
        selectedPoints: [0],
        points: [pointer, ...currentPoints],
      };
    }

    return {
      selectedPoints: [currentPoints.length],
      points: [...currentPoints, pointer],
    };
  },
};
