import { simplifyPolygon } from '../math';
import type { Point } from '../polygon';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

export const drawShape: TransitionIntent = {
  type: 'draw-shape',
  label: 'Draw shape',
  tools: ['pen', 'pencil'],
  modifiers: {
    Alt: 'Freehand drawing',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const shouldDraw = modifiers.Alt || state.slowState.drawMode || state.slowState.currentTool === 'pencil';
    if (state.isOpen && (state.line || state.polygon.points.length === 0) && shouldDraw) {
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
    // Use a different simplification factor based on the tool
    const simplificationFactor = state.slowState.currentTool === 'pencil' ? state.scale * 1.5 : state.scale * 3;
    const points = simplifyPolygon(state.transitionDraw, simplificationFactor);
    state.transitionDraw = [];

    // If no points to draw, don't change anything
    if (points.length === 0) {
      return;
    }

    const selected = state.selectedPoints[0];

    // Check if we're starting a new shape
    if (state.polygon.points.length === 0) {
      return {
        isOpen: true, // Keep it open for continued drawing
        points: points,
        selectedPoints: [points.length - 1], // Select the last point
      };
    }

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
