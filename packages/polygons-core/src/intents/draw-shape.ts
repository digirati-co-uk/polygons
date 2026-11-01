import { distance, simplifyPolygon } from '../math';
import type { Point } from '../polygon';
import { applySnapToPointer, resolvePoint, updateSnapState } from '../snap-utils';
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
    const endpoint = state.polygon.points[state.selectedPoints[0]];
    state.transitionDraw = [endpoint || resolvePoint(pointers[0], state, { disableSnap: modifiers.Shift })];
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    let currentPointer = pointers[0];
    if (modifiers.Shift || state.slowState.snapEnabled) {
      updateSnapState(currentPointer, state, 3, undefined, modifiers.Shift);
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
    const existing = state.polygon.points;
    const extension = existing.length ? points.slice(1) : points;
    // Reverse only the newly drawn stroke when prepending. Reversing existing
    // vertices would reconnect segments and detach their outgoing curve controls.
    const prepend = existing.length > 0 && selected === 0;
    const pointsToSave = prepend ? [...extension.reverse(), ...existing] : [...existing, ...extension];
    const firstPoint = pointsToSave[0];
    const lastPoint = pointsToSave[pointsToSave.length - 1];
    let selectedPointsToSave = [prepend ? 0 : pointsToSave.length - 1];
    const distinct = new Set(pointsToSave.map((p) => `${p[0]},${p[1]}`)).size;
    const isCloseEnoughToClose = distinct >= 3 && distance(firstPoint, lastPoint) / modifiers.proximity < drawCloseDistance;
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
