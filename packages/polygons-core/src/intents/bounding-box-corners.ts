import { distance } from '../math';
import { type Point, type Polygon, updateBoundingBox } from '../polygon';
import type { Modifiers, RenderState, TransitionIntent } from '../types';

export const boundingBoxCorners: TransitionIntent = {
  type: 'bounding-box-corners',
  label: 'Drag to resize',
  tools: ['pointer', 'box'],
  modifiers: {
    Shift: 'Maintain aspect ratio',
    Alt: 'Scale from center',
    Meta: 'Rotate',
  },
  isValid(pointers, state, modifiers) {
    state.transitionDirection = null;
    state.transitionRotate = false;
    // Currently not supported.
    if (state.isOpen) return false;
    // No bounding box.
    if (!state.slowState.boxMode && state.selectedPoints.length !== state.polygon.points.length) return false;
    if (!state.polygon.boundingBox) return false;
    // Config
    const margin = modifiers.proximity * 0.5;

    // This is when the modifier key is used.
    // const proximity = modifiers.Meta ? modifiers.proximity * 2 : modifiers.proximity;
    const proximity = modifiers.proximity * 5;

    // Types
    // - Scale from opposite corner
    // - Scale from origin twice the distance (alt?)
    // - Scale maintain aspect ratio (shift?)
    // - Rotate around origin (cmd)
    // - Rotate with steps (cmd+shit)

    // For validity, we just need to be close to a corner.
    const point = pointers[0];
    const box = state.polygon.boundingBox!;
    const x1 = box.x + margin;
    const x2 = box.x + box.width - margin * 2;
    const y1 = box.y + margin;
    const y2 = box.y + box.height - margin * 2;
    // But not inside the box.
    if (point[0] > x1 && point[0] < x2 && point[1] > y1 && point[1] < y2) {
      return false;
    }

    const southEast: Point = [box.x + box.width, box.y + box.height];
    const northWest: Point = [box.x, box.y];
    const northEast: Point = [box.x + box.width, box.y];
    const soutWest: Point = [box.x, box.y + box.height];

    const choice = ['ne', 'nw', 'se', 'sw'];
    const choices = {
      ne: northEast,
      nw: northWest,
      se: southEast,
      sw: soutWest,
    };
    const distances = [
      distance(pointers[0], northEast),
      distance(pointers[0], northWest),
      distance(pointers[0], southEast),
      distance(pointers[0], soutWest),
    ];
    const minDistance = Math.min(...distances);
    const index = distances.indexOf(minDistance);
    const transitionDirection = index === -1 ? null : choice[index];
    const distanceItem = transitionDirection ? (choices as any)[transitionDirection as any] : null;

    if (distances[0] < proximity || distances[1] < proximity || distances[2] < proximity || distances[3] < proximity) {
      if (transitionDirection) {
        const [x, y] = point;
        if (
          modifiers.Meta ||
          (x >= distanceItem[0] - modifiers.proximity * 4 &&
            y >= distanceItem[1] - modifiers.proximity * 4 &&
            x <= distanceItem[0] + modifiers.proximity * 4 && // Check if pointer is in the proximity area around the corner
            y <= distanceItem[1] + modifiers.proximity * 4 &&
            // But not too close to the corner itself
            !(
              x >= distanceItem[0] - modifiers.proximity * 2 &&
              y >= distanceItem[1] - modifiers.proximity * 2 &&
              x <= distanceItem[0] + modifiers.proximity * 2 &&
              y <= distanceItem[1] + modifiers.proximity * 2
            ))
        ) {
          if (!state.slowState.boxMode) {
            state.transitionRotate = true;
          }
        }
        state.transitionDirection = transitionDirection as any;
      }
      return true;
    }

    return false;
  },
  start(pointers: Point[], state: RenderState, modifiers: Modifiers): { selectedPoints?: number[] } | void {
    const point = pointers[0];
    const box = state.polygon.boundingBox!;
    const southEast: Point = [box.x + box.width, box.y + box.height];
    const northWest: Point = [box.x, box.y];
    const northEast: Point = [box.x + box.width, box.y];
    const soutWest: Point = [box.x, box.y + box.height];

    const choice = ['ne', 'nw', 'se', 'sw'];
    const distances = [
      distance(pointers[0], northEast),
      distance(pointers[0], northWest),
      distance(pointers[0], southEast),
      distance(pointers[0], soutWest),
    ];

    const minDistance = Math.min(...distances);

    const index = distances.indexOf(minDistance);
    state.transitionDirection = index !== -1 ? (choice[index] as any) : null;

    // if (minDistance > modifiers.proximity && !state.slowState.boxMode) {
    //   state.transitionRotate = true;
    // }
  },
  transition(pointers, state, modifiers) {
    const box = state.polygon.boundingBox!;
    const start = state.transitionOrigin || pointers[0];
    const [mx, my] = pointers[0];

    // -------------------------
    // ROTATION
    // -------------------------
    if ((modifiers.Meta || state.transitionRotate) && !state.slowState.boxMode) {
      const origin: Point = [box.x + box.width / 2, box.y + box.height / 2];

      const startAngle = Math.atan2(start[1] - origin[1], start[0] - origin[0]);
      const angle = Math.atan2(my - origin[1], mx - origin[0]);
      const shouldSnapToSteps = modifiers.Shift;
      const snapAngle = Math.PI / (modifiers.Alt ? 4 : 12);
      let angleDiff = angle - startAngle;
      if (shouldSnapToSteps) angleDiff = Math.round(angleDiff / snapAngle) * snapAngle;

      const cos = Math.cos(angleDiff);
      const sin = Math.sin(angleDiff);

      const newPoints: Point[] = [];
      for (const point of state.polygon.points) {
        const x1 = point[0] - origin[0];
        const y1 = point[1] - origin[1];
        const x2 = x1 * cos - y1 * sin;
        const y2 = x1 * sin + y1 * cos;
        const x3 = x2 + origin[0];
        const y3 = y2 + origin[1];
        newPoints.push(point.length === 6 ? [x3, y3, point[2], point[3], point[4], point[5]] : [x3, y3]);
      }

      state.transitionPoints = newPoints;
      const poly: Polygon = { points: newPoints, iedges: null, boundingBox: null, isBezier: false, bezierLines: [] };
      updateBoundingBox(poly);
      state.transitionBoundingBox = state.polygon.boundingBox
        ? { ...state.polygon.boundingBox, rotation: angleDiff }
        : null;
      return;
    }

    // -------------------------
    // RESIZE
    // -------------------------

    // Which corner is being dragged (signs of the corner vector).
    // se → (+1,+1), sw → (-1,+1), ne → (+1,-1), nw → (-1,-1)
    const dir = state.transitionDirection as 'se' | 'sw' | 'ne' | 'nw';
    const sx = dir.includes('e') ? 1 : -1;
    const sy = dir.includes('s') ? 1 : -1;

    // Anchor (origin) is the opposite corner, unless Alt = scale from center.
    const fromCenter = !!modifiers.Alt;
    let origin: Point;
    if (fromCenter) {
      origin = [box.x + box.width / 2, box.y + box.height / 2];
    } else {
      switch (dir) {
        case 'se':
          origin = [box.x, box.y];
          break; // top-left
        case 'sw':
          origin = [box.x + box.width, box.y];
          break; // top-right
        case 'ne':
          origin = [box.x, box.y + box.height];
          break; // bottom-left
        case 'nw':
          origin = [box.x + box.width, box.y + box.height];
          break; // bottom-right
      }
    }

    const ow = fromCenter ? box.width / 2 : box.width; // “corner vector” magnitudes
    const oh = fromCenter ? box.height / 2 : box.height;

    // If aspect must be fixed, project the mouse onto the corner-diagonal.
    // v = (sx*ow, sy*oh).  t = ((P-O)·v) / (v·v).  New scale = t.
    let scaleX: number, scaleY: number;

    if (modifiers.Shift || state.slowState.fixedAspectRatio) {
      const vx = sx * ow;
      const vy = sy * oh;
      const px = mx - origin[0];
      const py = my - origin[1];

      const denom = vx * vx + vy * vy;
      let t = denom > 0 ? (px * vx + py * vy) / denom : 1;

      // Clamp to avoid flips / zero size (adjust to your own rules/mins).
      const MIN_T = 0.01;
      t = Math.max(t, MIN_T);

      scaleX = t;
      scaleY = t;
    } else {
      // Free scaling (your previous dx/dy path), using the drag delta.
      let dx = 0,
        dy = 0;
      switch (dir) {
        case 'se':
          dx = mx - start[0];
          dy = my - start[1];
          break;
        case 'sw':
          dx = start[0] - mx;
          dy = my - start[1];
          break;
        case 'ne':
          dx = mx - start[0];
          dy = start[1] - my;
          break;
        case 'nw':
          dx = start[0] - mx;
          dy = start[1] - my;
          break;
      }

      if (fromCenter) {
        dx *= 2;
        dy *= 2;
      }

      scaleX = (box.width + dx) / box.width;
      scaleY = (box.height + dy) / box.height;
    }

    // Apply scale about the chosen origin
    const newPoints: Point[] = [];
    for (const point of state.polygon.points) {
      const x1 = point[0] - origin[0];
      const y1 = point[1] - origin[1];
      const x2 = x1 * scaleX;
      const y2 = y1 * scaleY;
      const x3 = x2 + origin[0];
      const y3 = y2 + origin[1];
      newPoints.push(point.length === 6 ? [x3, y3, point[2], point[3], point[4], point[5]] : [x3, y3]);
    }

    state.transitionPoints = newPoints;
    const poly: Polygon = { points: newPoints, iedges: null, boundingBox: null, bezierLines: [], isBezier: false };
    updateBoundingBox(poly);
    state.transitionBoundingBox = poly.boundingBox;
  },
  commit(pointers, state, modifiers) {
    const points = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;
    state.transitionRotate = false;

    return {
      points,
    };
  },
};
