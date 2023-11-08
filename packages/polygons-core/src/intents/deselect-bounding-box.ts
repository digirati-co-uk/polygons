import { ActionIntent } from '../types';

export const deselectBoundingBox: ActionIntent = {
  type: 'deselect-bounding-box',
  label: 'Deselect bounding box',
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    return (
      !state.isOpen && state.selectedPoints.length > 2 && state.selectedPoints.length === state.polygon.points.length
    );
  },
  commit(pointers, state, modifiers) {
    return {
      selectedPoints: [],
    };
  },
};
