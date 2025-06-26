import type { Point } from './polygon';
import type { RenderState, SnapGuide, SnapTarget } from './types';

const DEFAULT_SNAP_THRESHOLD = 15;

export function distancePointToLine(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): { distance: number; closestPoint: Point } {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { distance: dist, closestPoint: [x1, y1] };
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const closestPoint: Point = [closestX, closestY];
  const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

  return { distance, closestPoint };
}

export function lineIntersection(line1Start: Point, line1End: Point, line2Start: Point, line2End: Point): Point | null {
  const [x1, y1] = line1Start;
  const [x2, y2] = line1End;
  const [x3, y3] = line2Start;
  const [x4, y4] = line2End;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) < 1e-10) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const intersectionX = x1 + t * (x2 - x1);
    const intersectionY = y1 + t * (y2 - y1);
    return [intersectionX, intersectionY];
  }

  return null;
}

export function findAllSnapTargets(pointer: Point, state: RenderState, threshold?: number): SnapTarget[] {
  const snapThreshold = threshold || state.snapThreshold || DEFAULT_SNAP_THRESHOLD;
  const targets: SnapTarget[] = [];
  const [x, y] = pointer;
  const points = state.polygon.points;
  const isMovingPoint = state.slowState.transitionIntentType === 'move-point';

  // Find point snap targets
  if (state.slowState.snapToPoints) {
    for (let i = 0; i < points.length; i++) {
      if (isMovingPoint && state.selectedPoints.includes(i)) continue;
      const point = points[i];

      if (point[0] === x && point[1] === y) continue;

      const dx = point[0] - x;
      const dy = point[1] - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= snapThreshold) {
        targets.push({
          type: 'point',
          point: [point[0], point[1]],
          source: {
            pointIndex: i,
            polygon: state.polygon,
          },
          distance,
        });
      }
    }
  }

  // Find line snap targets
  if (state.slowState.snapToLines) {
    for (let i = 0; i < points.length; i++) {
      if (isMovingPoint && state.selectedPoints.includes(i)) continue;
      const nextIndex = (i + 1) % points.length;
      if (i === nextIndex) continue;

      const lineStart = points[i];
      const lineEnd = points[nextIndex];
      const { distance, closestPoint } = distancePointToLine(pointer, lineStart, lineEnd);

      if (distance <= snapThreshold) {
        targets.push({
          type: 'line',
          point: closestPoint,
          source: {
            lineIndex: i,
            polygon: state.polygon,
          },
          distance,
        });
      }
    }
  }

  // Find intersection snap targets
  if (state.slowState.snapToIntersections && points.length >= 4) {
    for (let i = 0; i < points.length; i++) {
      if (isMovingPoint && state.selectedPoints.includes(i)) continue;
      const nextI = (i + 1) % points.length;
      const line1Start = points[i];
      const line1End = points[nextI];

      for (let j = i + 2; j < points.length; j++) {
        if (isMovingPoint && state.selectedPoints.includes(j)) continue;
        const nextJ = (j + 1) % points.length;
        if (j === nextI || nextJ === i) continue;

        const line2Start = points[j];
        const line2End = points[nextJ];
        const intersection = lineIntersection(line1Start, line1End, line2Start, line2End);

        if (intersection) {
          const [ix, iy] = intersection;
          const distance = Math.sqrt((x - ix) ** 2 + (y - iy) ** 2);

          if (distance <= snapThreshold) {
            targets.push({
              type: 'intersection',
              point: intersection,
              source: {
                lineIndex: i,
                polygon: state.polygon,
              },
              distance,
            });
          }
        }
      }
    }
  }

  // Find parallel snap targets
  if (state.slowState.snapToParallel) {
    for (let i = 0; i < points.length; i++) {
      if (isMovingPoint && state.selectedPoints.includes(i)) continue;
      const point = points[i];
      const [px, py] = point;

      // Vertical alignment
      const dy = Math.abs(y - py);
      if (dy <= snapThreshold) {
        targets.push({
          type: 'parallel',
          point: [x, py],
          source: { pointIndex: i, polygon: state.polygon },
          distance: dy,
        });
      }

      // Horizontal alignment
      const dx = Math.abs(x - px);
      if (dx <= snapThreshold) {
        targets.push({
          type: 'parallel',
          point: [px, y],
          source: { pointIndex: i, polygon: state.polygon },
          distance: dx,
        });
      }
    }
  }

  return targets.sort((a, b) => a.distance - b.distance);
}

export function prioritizeSnapTargets(targets: SnapTarget[]): SnapTarget[] {
  return targets.sort((a, b) => {
    // Priority: points > intersections > parallel > lines
    const priorityA = a.type === 'point' ? 0 : a.type === 'intersection' ? 1 : a.type === 'parallel' ? 2 : 3;
    const priorityB = b.type === 'point' ? 0 : b.type === 'intersection' ? 1 : b.type === 'parallel' ? 2 : 3;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.distance - b.distance;
  });
}

export function createSnapGuides(targets: SnapTarget[], state: RenderState): SnapGuide[] {
  const guides: SnapGuide[] = [];

  for (const target of targets) {
    switch (target.type) {
      case 'point':
        guides.push({
          type: 'point',
          points: [target.point],
          target,
        });
        break;

      case 'line':
        if (target.source?.lineIndex !== undefined) {
          const points = state.polygon.points;
          const lineIndex = target.source.lineIndex;
          const nextIndex = (lineIndex + 1) % points.length;
          const lineStart = points[lineIndex];
          const lineEnd = points[nextIndex];

          guides.push({
            type: 'line',
            points: [lineStart, lineEnd, target.point],
            target,
          });
        } else {
          guides.push({
            type: 'point',
            points: [target.point],
            target,
          });
        }
        break;

      case 'intersection':
        guides.push({
          type: 'cross',
          points: [target.point],
          target,
        });
        break;

      case 'parallel':
        if (target.source?.pointIndex !== undefined) {
          const sourcePoint = state.polygon.points[target.source.pointIndex];
          guides.push({
            type: 'parallel-line',
            points: [sourcePoint, target.point],
            target,
          });
        }
        break;
    }
  }

  return guides;
}
('');

export function updateSnapState(
  pointer: Point,
  state: RenderState,
  maxGuides: number = 5,
  excludeLineIndex?: number | null,
): Point | null {
  if (!state.slowState.snapEnabled) {
    // Clear snapping state if disabled
    state.snapTargets = [];
    state.activeSnapGuides = [];
    state.isSnapping = false;
    state.snapPoint = null;
    return null;
  }

  const snapTargets = findAllSnapTargets(pointer, state, undefined, excludeLineIndex);

  if (snapTargets.length === 0) {
    // No snap targets, clear snapping state
    state.snapTargets = [];
    state.activeSnapGuides = [];
    state.isSnapping = false;
    state.snapPoint = null;
    return null;
  }

  const prioritizedTargets = prioritizeSnapTargets(snapTargets);

  // Update snap state
  state.snapTargets = prioritizedTargets;
  state.activeSnapGuides = createSnapGuides(prioritizedTargets.slice(0, maxGuides), state);
  state.isSnapping = true;
  state.snapPoint = prioritizedTargets[0].point;

  return state.snapPoint;
}

export function clearSnapState(state: RenderState): void {
  state.snapTargets = [];
  state.activeSnapGuides = [];
  state.isSnapping = false;
  state.snapPoint = null;
}

export function getSnapPoint(state: RenderState): Point | null {
  return state.snapPoint;
}

export function isSnappingActive(state: RenderState): boolean {
  return state.isSnapping && state.snapPoint !== null;
}

export function applySnapToPointer(pointer: Point, state: RenderState): Point {
  if (isSnappingActive(state) && state.snapPoint) {
    return state.snapPoint;
  }
  return pointer;
}
