import type { ActionIntent } from '../types';

export const deselectPoints: ActionIntent = {
  type: 'deselect-points',
  label: 'Deselect points',
  trigger: { type: 'click' },
  tools: ['pointer', 'pen'],
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0 && state.slowState.canDeselect;
  },
  commit(pointers, state, modifiers) {
    return { selectedPoints: [] };
  },
};
