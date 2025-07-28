import type { Point } from '../polygon';
import { clearSnapState, updateSnapState } from '../snap-utils';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

export const snap: TransitionIntent = {
  type: 'snap',
  label: 'Smart snap',
  tools: ['pointer', 'pen', 'line'],
  modifiers: {
    Shift: 'Disable snapping',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Don't snap if Shift is pressed (allows precise positioning)
    if (modifiers.Shift || !state.slowState.snapEnabled) {
      return false;
    }

    // Don't snap if we're already transitioning another intent that's not snapping
    if (state.slowState.transitioning && state.slowState.transitionIntentType !== 'snap') {
      return false;
    }

    // Check if any snap types are enabled
    if (!state.slowState.snapToPoints && !state.slowState.snapToLines && !state.slowState.snapToIntersections) {
      return false;
    }

    // Use utility function to check for snap targets
    const snapPoint = updateSnapState(pointers[0], state, 0); // Don't update guides in isValid
    return snapPoint !== null;
  },
  start(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    updateSnapState(pointers[0], state, 5); // Show up to 5 guides
  },
  transition(pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Update snap state and apply the snap to the pointer
    const snapPoint = updateSnapState(pointers[0], state, 5);
    if (snapPoint) {
      state.pointer = snapPoint;
    }
  },
  commit(_pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Clear snapping state
    clearSnapState(state);
  },
};
