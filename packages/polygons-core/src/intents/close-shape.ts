import { ActionIntent } from '../types';
import { distance } from '../math';

export const closeShape: ActionIntent = {
  type: 'close-shape',
  label: 'Close shape',
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
        points: state.polygon.points.slice(0).reverse(),
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
