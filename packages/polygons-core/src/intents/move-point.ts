import { closestVertex, reattachHandles, type Point } from '../polygon';
import { clampXYToBounds } from '../math';
import { clearSnapState, resolvePoint } from '../snap-utils';
import type { Modifiers, RenderState, TransitionIntent } from '../types';
import { boundingBoxCorners } from './bounding-box-corners';

export const movePoint: TransitionIntent = {
  type: 'move-point',
  label: 'Move point',
  tools: ['pointer', 'pen', 'line'],
  modifiers: {
    Shift: 'Constrain to axis, snap to curves only',
  },
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean {
    // Are we in proximity of any selected points?
    // if (state.selectedPoints.length === 0) {
    //   return false;
    // }
    if (modifiers.Alt) {
      return false;
    }

    if (state.slowState.boxMode && (!state.polygon.boundingBox?.width || !state.polygon.boundingBox?.height))
      return false;
    const threshold = modifiers.proximity;

    const [x, y] = pointers[0];
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    // if (selected.length > 1) {
    //   for (let i = 0; i < selected.length; i++) {
    //     const idx = selected[i];
    //     const point = points[idx];
    //     const dx = point[0] - x;
    //     const dy = point[1] - y;
    //     if (dx * dx + dy * dy < threshold * threshold) {
    //       return true;
    //     }
    //   }
    // } else {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const dx = point[0] - x;
      const dy = point[1] - y;
      if (dx * dx + dy * dy < threshold * threshold) {
        return true;
      }
    }
    // }

    return false;
  },
  start(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.slowState.boxMode) {
      if (boundingBoxCorners.start) {
        return boundingBoxCorners.start(pointers, state, modifiers);
      }
      return;
    }
    if (state.selectedPoints.length < 2) {
      // We select the closest point.
      const [a, b, idx] = closestVertex(state.polygon, pointers[0]);

      return {
        selectedPoints: [idx],
      };
    }

    if (state.slowState.closestPoint !== null && !state.selectedPoints.includes(state.slowState.closestPoint)) {
      // We select the closest point.
      const idx = state.slowState.closestPoint;

      return {
        selectedPoints: [idx],
      };
    }
  },
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.slowState.boxMode) {
      return boundingBoxCorners.transition(pointers, state, modifiers);
    }
    // Translate the selected points
    const starting = state.transitionOrigin!;
    const points = state.polygon.points;
    const selectedPoints = state.selectedPoints;
    const anchor = points[selectedPoints[0]];
    if (!anchor) return;
    let dx = pointers[0][0] - starting[0];
    let dy = pointers[0][1] - starting[1];
    if (modifiers.Shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const target = resolvePoint([anchor[0] + dx, anchor[1] + dy], state, { disableSnap: modifiers.Shift });
    dx = target[0] - anchor[0];
    dy = target[1] - anchor[1];
    const selected = points.filter((_, i) => selectedPoints.includes(i));
    const xs = selected.map((p) => p[0]);
    const ys = selected.map((p) => p[1]);
    const [boundedX, boundedY] = clampXYToBounds(dx, dy, {
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    }, state.slowState.bounds);
    if (boundedX !== dx || boundedY !== dy) clearSnapState(state);
    dx = boundedX;
    dy = boundedY;
    state.activeHandle = [anchor[0] + dx, anchor[1] + dy];
    const transitionPoints: Point[] = [];

    for (let i = 0; i < points.length; i++) {
      const selected = selectedPoints.indexOf(i) !== -1;
      const p = points[i];
      if (selected) {
        if (p.length === 6) {
          transitionPoints.push([p[0] + dx, p[1] + dy, p[2], p[3], p[4], p[5]]);
        } else {
          transitionPoints.push([p[0] + dx, p[1] + dy]);
        }
      } else {
        transitionPoints.push(p);
      }
    }
    state.transitionPoints = reattachHandles(points, transitionPoints, state.isOpen);
  },
  commit(pointers: Point[], state: RenderState, modifiers: Modifiers) {
    if (state.slowState.boxMode) {
      return boundingBoxCorners.commit(pointers, state, modifiers);
    }
    const newPoints = state.transitionPoints!;

    state.transitionPoints = null;
    state.transitionBoundingBox = null;

    return { points: newPoints };
  },
};
