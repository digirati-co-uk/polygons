import { Modifiers, RenderState, TransitionIntent } from '../types';
import { distance } from '../math';
import { Point, Polygon, updateBoundingBox } from '../polygon';

export const boundingBoxCorners: TransitionIntent = {
  type: 'bounding-box-corners',
  label: 'Drag to resize',
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
    if (state.selectedPoints.length !== state.polygon.points.length) return false;
    if (!state.polygon.boundingBox) return false;

    // Config
    const margin = modifiers.proximity * 0.5;

    // This is when the modifier key is used.
    // const proximity = modifiers.Meta ? modifiers.proximity * 2 : modifiers.proximity;
    const proximity = modifiers.proximity * 3;

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
    const distances = [
      distance(pointers[0], northEast),
      distance(pointers[0], northWest),
      distance(pointers[0], southEast),
      distance(pointers[0], soutWest),
    ];
    const minDistance = Math.min(...distances);
    if (distances[0] < proximity || distances[1] < proximity || distances[2] < proximity || distances[3] < proximity) {
      if (minDistance > modifiers.proximity || modifiers.Meta) {
        state.transitionRotate = true;
      }
      const index = distances.indexOf(Math.min(...distances));
      state.transitionDirection = index !== -1 ? (choice[index] as any) : null;

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

    if (minDistance > modifiers.proximity) {
      state.transitionRotate = true;
    }
  },
  transition(pointers, state, modifiers) {
    // Start with transform, scaling points from the origin.
    const box = state.polygon.boundingBox!;
    let origin: Point = [box.x, box.y];
    const start = state.transitionOrigin || pointers[0];
    const [x, y] = pointers[0];

    if (modifiers.Meta || state.transitionRotate) {
      origin = [box.x + box.width / 2, box.y + box.height / 2];
      // Rotation.
      const startAngle = Math.atan2(start[1] - origin[1], start[0] - origin[0]);
      let angle = Math.atan2(y - origin[1], x - origin[0]);
      const shouldSnapToSteps = modifiers.Shift;
      const snapAngle = Math.PI / (modifiers.Alt ? 4 : 12);
      let angleDiff = angle - startAngle;
      if (shouldSnapToSteps) {
        angleDiff = Math.round(angleDiff / snapAngle) * snapAngle;
      }

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

        newPoints.push([x3, y3]);
      }

      state.transitionPoints = newPoints;
      const poly: Polygon = { points: newPoints, iedges: null, boundingBox: null };
      updateBoundingBox(poly);
      state.transitionBoundingBox = state.polygon.boundingBox
        ? { ...state.polygon.boundingBox, rotation: angleDiff }
        : null;
      return;
    }

    let dx = 0;
    let dy = 0;

    switch (state.transitionDirection) {
      case 'se': {
        origin = [box.x, box.y];
        dx = x - start[0];
        dy = y - start[1];
        break;
      }
      case 'sw': {
        origin = [box.x + box.width, box.y];
        dx = start[0] - x;
        dy = y - start[1];
        break;
      }
      case 'ne': {
        origin = [box.x, box.y + box.height];
        dx = x - start[0];
        dy = start[1] - y;
        break;
      }
      case 'nw': {
        origin = [box.x + box.width, box.y + box.height];
        dx = start[0] - x;
        dy = start[1] - y;
        break;
      }
    }

    if (modifiers.Alt) {
      origin = [box.x + box.width / 2, box.y + box.height / 2];
      dx *= 2;
      dy *= 2;
    }

    if (modifiers.Shift) {
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

      newPoints.push([x3, y3]);
    }
    state.transitionPoints = newPoints;
    const poly: Polygon = { points: newPoints, iedges: null, boundingBox: null };
    updateBoundingBox(poly);
    state.transitionBoundingBox = poly.boundingBox;

    // @todo
    // console.log(state.transitionDirection);
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
