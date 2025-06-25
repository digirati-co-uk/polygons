import type { TransitionIntent } from '../types';

export const selectMultiplePoints: TransitionIntent = {
  type: 'select-multiple-points',
  label: 'Drag to select multiple points',
  tools: ['pointer', 'pen'],
  isValid(pointers, state, modifiers) {
    if (state.slowState.lineMode && state.polygon.points.length >= 2) {
      return true;
    }
    if (state.slowState.boxMode) {
      return false;
    }
    if (state.line) {
      return false;
    }
    return true;
  },
  transition(pointers, state, modifiers) {
    if (!state.transitionOrigin) return;

    const x1 = state.transitionOrigin[0];
    const y1 = state.transitionOrigin[1];

    const x2 = pointers[0][0];
    const y2 = pointers[0][1];

    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    state.selectionBox = { x, y, width, height };

    return;
  },
  commit(pointers, state, modifiers) {
    if (state.selectionBox) {
      const pointsInsideIdx: number[] = [];

      if (modifiers.Shift) {
        pointsInsideIdx.push(...state.selectedPoints);
      }

      for (let i = 0; i < state.polygon.points.length; i++) {
        const point = state.polygon.points[i];
        if (
          point[0] >= state.selectionBox.x &&
          point[0] <= state.selectionBox.x + state.selectionBox.width &&
          point[1] >= state.selectionBox.y &&
          point[1] <= state.selectionBox.y + state.selectionBox.height
        ) {
          pointsInsideIdx.push(i);
        }
      }

      return { selectedPoints: pointsInsideIdx };
    }
  },
};
