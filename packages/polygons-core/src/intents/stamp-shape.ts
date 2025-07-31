import { type Point, type Polygon, updateBoundingBox } from '../polygon';
import { square } from '../shapes';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

export const stampShape: TransitionIntent = {
  type: 'stamp-shape',
  label: 'Stamp shape',
  tools: ['stamp', 'box'],
  modifiers: {
    Shift: 'Maintain aspect ratio',
  },

  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.polygon.points.length && !state.slowState.canDelete) {
      return false;
    }
    return true;
  },

  start(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    const pointer = pointers[0];
    // Check the selected shape, rescale and insert at the cursor position (small) in transition points.
    const stamp = state.slowState.selectedStamp || square;

    if (pointer) {
      // No rounding, fit it into a 32x32 box, starting from the pointer.
      const x = pointer[0];
      const y = pointer[1];
      const newPoints: Point[] = [];

      const stampX = Math.min(...stamp.points.map((p) => p[0]));
      const stampY = Math.min(...stamp.points.map((p) => p[1]));
      const stampWidth = Math.max(...stamp.points.map((p) => p[0])) - stampX;
      const stampHeight = Math.max(...stamp.points.map((p) => p[1])) - stampY;

      let ratio = stampWidth / 32;
      if (stampHeight / 32 > ratio) {
        ratio = stampHeight / 32;
      }
      const selectedPoints: number[] = [];
      let i = 0;
      for (const point of stamp.points) {
        selectedPoints.push(i);
        newPoints.push([x + (point[0] - stampX) / ratio, y + (point[1] - stampY) / ratio]);
        i++;
      }

      state.transitionPoints = newPoints;
      return {
        isOpen: false,
        selectedPoints,
        points: newPoints,
      };
    }
  },

  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (!state.transitionOrigin) return;

    const box = state.polygon.boundingBox!;
    const origin: Point = [box.x, box.y];
    const start = state.transitionOrigin || pointers[0];
    const [x, y] = pointers[0];

    const x1 = state.transitionOrigin[0];
    const y1 = state.transitionOrigin[1];

    const x2 = pointers[0][0];
    const y2 = pointers[0][1];

    let dx = x2 - x1 - 32;
    let dy = y2 - y1 - 32;

    if (modifiers.Shift || state.slowState.fixedAspectRatio) {
      // Maintain aspect ratio.
      const aspect = box.width / box.height;
      if (Math.abs(box.width / dx) > Math.abs(box.height / dy)) {
        dy = dx / aspect;
      } else {
        dx = dy * aspect;
      }
    }

    const scaleX = (box.width + dx) / box.width;
    const scaleY = (box.height + dy) / box.height;

    const newPoints: Point[] = [];
    for (const point of state.polygon.points) {
      // minus origin
      const x1 = point[0] - origin[0];
      const y1 = point[1] - origin[1];
      // scale
      const x2 = x1 * scaleX;
      const y2 = y1 * scaleY;
      // add origin
      const x3 = x2 + origin[0];
      const y3 = y2 + origin[1];

      if (point.length === 6) {
        newPoints.push([x3, y3, point[2], point[3], point[4], point[5]]);
        continue;
      }

      newPoints.push([x3, y3]);
    }
    state.transitionPoints = newPoints;
    const poly: Polygon = { points: newPoints, iedges: null, boundingBox: null, bezierLines: [], isBezier: false };
    updateBoundingBox(poly);
    state.transitionBoundingBox = poly.boundingBox;
  },

  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    return {
      isOpen: false,
      points: state.transitionPoints!,
      tool: 'pointer',
    };
  },
};
