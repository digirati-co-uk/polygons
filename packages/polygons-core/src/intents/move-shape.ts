import { TransitionIntent } from '../types';
import { translateBoundingBox } from './translate-bounding-box';

export const moveShape: TransitionIntent = {
  type: 'move-shape',
  label: 'Move shape',
  isValid(pointers, state, modifiers) {
    // Does the point intersect with the shape?
    const [x, y] = pointers[0];
    const points = state.polygon.points;
    const box = state.polygon.boundingBox;

    // @todo only enable when all points are NOT selected.

    if (!box) return false;

    // Outside the bounding box.
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.height + box.y) {
      return false;
    }

    // Outside the polygon.
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (
        points[i][1] > y != points[j][1] > y &&
        x < ((points[j][0] - points[i][0]) * (y - points[i][1])) / (points[j][1] - points[i][1]) + points[i][0]
      ) {
        inside = !inside;
      }
    }
    return inside;
  },
  transition(pointers, state, modifiers) {
    translateBoundingBox.transition(pointers, state, modifiers);
  },
  commit(pointers, state, modifiers) {
    const points = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return {
      points,
    };
  },
};
