import { translateBoundingBox } from './translate-bounding-box';
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
  transition(pointers, state, modifiers) {
    translateBoundingBox.transition(pointers, state, modifiers);
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
