import { ActionIntent, Modifiers, RenderState } from '../types';
import { Point } from '../polygon';

export const deselectDraw: ActionIntent = {
  type: 'deselect-draw',
  label: 'Deselect draw',
  trigger: { type: 'key', key: 'Escape' },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // if (!state.isOpen) {
    //   return false;
    // }

    // Always true, since it's just the "default" or fallback option when you click escape.
    return true;
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers): { selectedPoints?: number[] } | void {
    return { selectedPoints: [] };
  },
};
