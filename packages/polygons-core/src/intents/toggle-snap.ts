import type { Point } from '../polygon';
import type { ActionIntent, Modifiers, RenderState } from '../types';

export const toggleSnap: ActionIntent = {
  type: 'toggle-snap',
  label: 'Toggle snapping',
  trigger: { type: 'key', key: '`' },
  tools: ['pointer', 'pen', 'line', 'lineBox', 'box', 'stamp'],
  modifiers: {},
  isValid(_pointers: Point[], _state: RenderState, _modifiers: Modifiers): boolean {
    // Always valid - can toggle snapping at any time
    return true;
  },
  commit(_pointers: Point[], state: RenderState, _modifiers: Modifiers) {
    // Toggle the snap enabled state directly in slowState
    // This is a special case where we need to modify state directly
    // since the intent system doesn't support slowState updates
    const newSnapEnabled = !state.slowState.snapEnabled;
    state.slowState.snapEnabled = newSnapEnabled;

    // If disabling snapping, clear any active snap state
    if (!newSnapEnabled) {
      state.snapTargets = [];
      state.activeSnapGuides = [];
      state.isSnapping = false;
      state.snapPoint = null;
    }

    // Return empty object to indicate successful action
    return {};
  },
};
