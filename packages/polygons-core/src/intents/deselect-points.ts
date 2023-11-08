import { ActionIntent } from '../types';

export const deselectPoints: ActionIntent = {
  type: 'deselect-points',
  label: 'Deselect points',
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0;
  },
  commit(pointers, state, modifiers) {
    return { selectedPoints: [] };
  },
};
