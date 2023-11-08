import { ActionIntent } from '../types';
import { splitLine } from './split-line';

export const cutLine: ActionIntent = {
  type: 'cut-line',
  label: 'Cut line',
  trigger: { type: 'click' },
  isValid(pointers, state, modifiers) {
    return splitLine.isValid(pointers, state, modifiers);
  },
  commit(pointers, state, modifiers) {
    if (modifiers.Shift && !state.isOpen) {
      // We want to split.
      const points = state.polygon.points;
      const beforePoints = [];
      const afterPoints = [];
      let hasSplit = false;
      for (let i = 0; i < points.length; i++) {
        if (!hasSplit) {
          // Start population the before points.
          beforePoints.push(points[i]);
        } else {
          afterPoints.push(points[i]);
        }

        // Add the new point that we are transitioning _after_ the closest line.
        if (state.closestLineIndex === i) {
          hasSplit = true;
        }
      }
      console.log('did split??');
      return {
        isOpen: true,
        points: [...afterPoints, ...beforePoints],
      };
    }

    // Otherwise we want to insert a new point.
    const points = state.polygon.points;
    const newPoints = [];

    for (let i = 0; i < points.length; i++) {
      newPoints.push(points[i]);

      // Add the new point that we are transitioning _after_ the closest line.
      if (state.closestLineIndex === i) {
        const newPoint = state.closestLinePoint!;
        newPoints.push(newPoint);
      }
    }

    return {
      points: newPoints,
    };
  },
};
