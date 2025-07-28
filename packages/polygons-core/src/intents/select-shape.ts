import type { ActionIntent } from '../types';
import { moveShape } from './move-shape';

export const selectShape: ActionIntent = {
  type: 'select-shape',
  label: 'Select shape',
  trigger: { type: 'click' },
  tools: ['pointer'],
  isValid(pointers, state, modifiers) {
    return moveShape.isValid(pointers, state, modifiers);
  },
  commit(pointers, state, modifiers) {
    return {
      selectedPoints: state.polygon.points.map((_, idx) => idx),
    };
  },
};
