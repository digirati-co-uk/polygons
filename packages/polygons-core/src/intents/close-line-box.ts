import type { ActionIntent } from '../types';

export const closeLineBox: ActionIntent = {
  type: 'close-line-box',
  label: 'Close Line Box',
  tools: ['lineBox'],
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    return state.polygon.points.length === 2 && state.lineBox !== null && state.slowState.boxMode === false;
  },

  commit(pointers, state, modifiers) {
    if (!state.lineBox) {
      return {};
    }
    return {
      isOpen: false,
      points: state.lineBox,
    };
  },
};
