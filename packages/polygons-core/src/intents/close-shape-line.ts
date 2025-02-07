import { ActionIntent } from '../types';
import { closeShape } from './close-shape';

export const closeShapeLine: ActionIntent = {
  type: 'close-shape-line',
  label: 'Close shape line',
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    // Closed shape.
    if (!state.isOpen) {
      return false;
    }
    if (state.slowState.boxMode) {
      return false;
    }

    // Not enough lines to close.
    if (state.polygon.points.length < 3) {
      return false;
    }

    if (!state.closestLinePoint || state.closestLineDistance >= modifiers.proximity) {
      return false;
    }

    // Are we intersecting the last or first line?
    if (state.closestLineIndex === 0 || state.closestLineIndex === state.polygon.points.length - 2) {
      return true;
    }

    // Then we are.
    return true;
  },
  commit(pointers, state, modifiers) {
    return closeShape.commit(pointers, state, modifiers);
  },
};
