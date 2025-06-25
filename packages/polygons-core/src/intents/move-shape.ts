import type { TransitionIntent } from '../types';
import { translateBoundingBox } from './translate-bounding-box';

export const moveShape: TransitionIntent = {
  type: 'move-shape',
  label: 'Move shape',
  tools: ['pointer', 'hand', 'box'],
  isValid(pointers, state, modifiers) {
    if (modifiers.Shift) {
      return false;
    }

    return state.slowState.pointerInsideShape && (!state.isOpen || state.line === null);
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
