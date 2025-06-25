import type { Point } from '../polygon';
import type { ActionIntent } from '../types';

export const stampFixedSizeShape: ActionIntent = {
  type: 'stamp-fixed-size-shape',
  label: 'Stamp fixed size shape',
  trigger: { type: 'click' },
  tools: ['stamp'],
  isValid(pointers, state, modifiers) {
    return state.slowState.selectedStamp !== null;
  },
  commit(pointers, state, modifiers) {
    const pointer = pointers[0];
    const stamp = state.slowState.selectedStamp;

    if (!pointer || !stamp) return;

    // Check the selected shape, rescale and insert at the cursor position (small) in transition points.
    let x = pointer[0];
    let y = pointer[1];
    const newPoints: Point[] = [];

    const stampX = Math.min(...stamp.points.map((p) => p[0]));
    const stampY = Math.min(...stamp.points.map((p) => p[1]));
    const stampWidth = Math.max(...stamp.points.map((p) => p[0])) - stampX;
    const stampHeight = Math.max(...stamp.points.map((p) => p[1])) - stampY;

    const size = 4 * modifiers.proximity;
    let ratio = stampWidth / size;
    if (stampHeight / size > ratio) {
      ratio = stampHeight / size;
    }

    x -= stampWidth / ratio / 2;
    y -= stampHeight / ratio / 2;

    let i = 0;
    for (const point of stamp.points) {
      newPoints.push([x + (point[0] - stampX) / ratio, y + (point[1] - stampY) / ratio]);
      i++;
    }

    return {
      isOpen: false,
      points: newPoints,
    };
  },
};
