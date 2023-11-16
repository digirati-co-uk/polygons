import { Modifiers, RenderState, TransitionIntent } from '../types';
import { Point } from '../polygon';
import { simplifyPolygon } from '../math';

export const drawShape: TransitionIntent = {
  type: 'draw-shape',
  label: 'Draw shape',
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.isOpen && (state.line || state.polygon.points.length === 0) && modifiers.Alt) {
      return true;
    }

    return false;
  },

  start(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    state.transitionDraw = [];
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    state.transitionDraw.push(pointers[0]);
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    // @todo
    const points = simplifyPolygon(state.transitionDraw, state.scale * 3);
    state.transitionDraw = [];

    const selected = state.selectedPoints[0];

    if (selected === 0) {
      return {
        isOpen: false,
        points: [...points, ...state.polygon.points.slice(0).reverse()],
      };
    }
    return {
      isOpen: false,
      points: [...state.polygon.points, ...points],
    };
  },
};
