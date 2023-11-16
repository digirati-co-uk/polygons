import { ActionIntent, Modifiers, RenderState } from '../types';
import { Point } from '../polygon';

export const deletePoint: ActionIntent = {
  type: 'delete-point',
  label: 'Delete point',
  trigger: { type: 'key', key: 'Backspace' },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // if (!state.isOpen) {
    //   return false;
    // }

    return state.selectedPoints.length > 0;
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
    };
  },
};
