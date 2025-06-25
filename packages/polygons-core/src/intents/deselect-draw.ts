import type { Point } from '../polygon';
import type { ActionIntent, Modifiers, RenderState } from '../types';

export const deselectDraw: ActionIntent = {
  type: 'deselect-draw',
  label: 'Deselect draw',
  trigger: { type: 'key', key: 'Escape' },
  tools: ['pointer', 'pen', 'box', 'lineBox', 'stamp', 'hand', 'pencil'],
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
