import type { ActionIntent } from '../types';

export const deselectBoundingBox: ActionIntent = {
  type: 'deselect-bounding-box',
  label: 'Deselect bounding box',
  tools: ['pointer'],
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    return (
      state.slowState.canDeselect &&
      !state.isOpen &&
      !state.slowState.boxMode &&
      state.selectedPoints.length > 2 &&
      state.selectedPoints.length === state.polygon.points.length
    );
  },
  commit(pointers, state, modifiers) {
    if (state.slowState.lastCreationTool === 'pen') {
      return { selectedPoints: [], tool: 'pen' };
    }
    return {
      selectedPoints: [],
    };
  },
};
