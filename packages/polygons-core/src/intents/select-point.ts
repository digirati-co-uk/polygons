import { ActionIntent, Modifiers, RenderState } from '../types';
import { Point } from '../polygon';
import { selectMultiplePoints } from './select-multiple-points';

const threshold = 10;

export const selectPoint: ActionIntent = {
  type: 'select-point',
  label: 'Select point',
  trigger: { type: 'click' },
  modifiers: {
    Shift: 'Add to selection',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    let skipIndex = -1;
    if (state.selectedPoints.length === 1) {
      const selected = state.selectedPoints[0];
      if (selected === 0) {
        skipIndex = state.polygon.points.length - 1;
      }
      if (selected === state.polygon.points.length - 1) {
        skipIndex = 0;
      }
    }
    if (state.slowState.boxMode) {
      return false;
    }

    const [x, y] = pointers[0];
    const points = state.polygon.points;
    // const selected = state.selectedPoints;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const dx = point[0] - x;
      const dy = point[1] - y;
      if (dx * dx + dy * dy < threshold * threshold) {
        if (skipIndex === i) return false;
        return true;
      }
    }

    return false;
  },

  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const selectedPoints = modifiers.Shift ? [...state.selectedPoints] : [];
    const [x, y] = pointers[0];
    const points = state.polygon.points;
    const pointDistances = points
      .map((point, idx) => {
        const dx = point[0] - x;
        const dy = point[1] - y;
        return [dx * dx + dy * dy, idx];
      })
      .sort((a, b) => a[0] - b[0]);

    const closestPoint = pointDistances[0];

    state.line = null;

    if (!selectedPoints.includes(closestPoint[1])) {
      selectedPoints.push(closestPoint[1]);
    } else if (modifiers.Shift) {
      return { selectedPoints: selectedPoints.filter((i) => i !== closestPoint[1]) };
    }

    return { selectedPoints };
  },
};
