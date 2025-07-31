import type { Point } from '../polygon';
import type { ActionIntent, Modifiers, RenderState } from '../types';

export const deletePoint: ActionIntent = {
  type: 'delete-point',
  label: 'Delete point',
  tools: ['pointer', 'pen', 'lineBox', 'line'],
  trigger: { type: 'key', key: 'Backspace' },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // if (!state.isOpen) {
    //   return false;
    // }
    // if (state.slowState.boxMode) {
    //   return false;
    // }

    return state.selectedPoints.length > 0 && state.slowState.canDelete;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const points = state.polygon.points;
    const newPoints = points.filter((_, k) => {
      return !state.selectedPoints.includes(k);
    });

    return {
      isOpen: newPoints.length < 3,
      selectedPoints: [],
      points: newPoints,
      tool: state.slowState.boxMode ? 'box' : undefined,
    };
  },
};
