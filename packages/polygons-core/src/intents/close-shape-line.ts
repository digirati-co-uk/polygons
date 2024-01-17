import { ActionIntent, Modifiers, RenderState } from '../types';
import { Point } from '../polygon';
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

    // Not enough lines to close.
    if (state.polygon.points.length < 3) {
      return false;
    }

    if (!state.closestLinePoint || state.closestLineDistance >= modifiers.proximity) {
      console.log('A');
      return false;
    }

    // Are we intersecting the last or first line?
    if (state.closestLineIndex === 0 || state.closestLineIndex === state.polygon.points.length - 2) {
      return true;
    }

    console.log('B', state.closestLineIndex, state.polygon.points.length - 2);

    // Then we are.
    return true;
  },
  commit(pointers, state, modifiers) {
    return closeShape.commit(pointers, state, modifiers);
  },
};
