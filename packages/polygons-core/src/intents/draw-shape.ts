import { distance, simplifyPolygon } from '../math';
import type { Point } from '../polygon';
import { applySnapToPointer, updateSnapState } from '../snap-utils';
import type { Modifiers, RenderState, TransitionIntent, ValidTools } from '../types';

export const drawShape: TransitionIntent = {
  type: 'draw-shape',
  label: 'Draw shape',
  tools: ['pen', 'pencil'],
  modifiers: {
    Alt: 'Freehand drawing',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const shouldDraw = modifiers.Alt || state.slowState.currentTool === 'pencil';
    if (state.isOpen && (state.line || state.polygon.points.length === 0) && shouldDraw) {
      return true;
    }

    return false;
  },

  start(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    state.transitionDraw = [];
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    let currentPointer = pointers[0];
    if (!modifiers.Shift && state.slowState.snapEnabled) {
      updateSnapState(currentPointer, state, 3);
      currentPointer = applySnapToPointer(currentPointer, state);
    }
    state.transitionDraw.push(currentPointer);
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
    let isOpen = true;
    const drawCloseDistance = 3;
    const selected = state.selectedPoints[0];
    let pointsToSave = [...state.polygon.points, ...points];
    let firstPoint = pointsToSave[0];
    let lastPoint = pointsToSave[pointsToSave.length - 1];
    // Need to flip first and last.
    if (selected === 0) {
      firstPoint = pointsToSave[pointsToSave.length - 1];
      lastPoint = pointsToSave[0];
      pointsToSave = [...points, ...state.polygon.points.slice(0).reverse()];
    }
    let selectedPointsToSave = [pointsToSave.length - 1];
    const isCloseEnoughToClose = distance(firstPoint, lastPoint) / modifiers.proximity < drawCloseDistance;
    let tool: ValidTools | '' = '';
    if (isCloseEnoughToClose) {
      isOpen = false;
      tool = 'pointer';
      // Select all points?
      selectedPointsToSave = pointsToSave.map((_, index) => index);
    }

    return {
      isOpen,
      tool: tool || undefined,
      points: pointsToSave,
      selectedPoints: selectedPointsToSave,
    };
  },
};
