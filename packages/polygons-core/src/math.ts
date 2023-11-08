import { Point } from './polygon';

export function proximity(pointer: Point, points: Array<[number, number]>, threshold: number, scale: number) {
  const distances = points.map((point) => {
    const dx = pointer[0] - point[0];
    const dy = pointer[1] - point[1];
    return Math.sqrt(dx * dx + dy * dy);
  });

  const min = Math.min(...distances);

  if (min * scale < threshold) {
    return distances.indexOf(min);
  }

  return undefined;
}

export function distance1D(a: number, b: number) {
  return Math.abs(a - b);
}

export function distance(a: [number, number], b: [number, number]) {
  const xDelta = distance1D(a[0], b[0]);
  const yDelta = distance1D(a[1], b[1]);
  return Math.sqrt(Math.pow(xDelta, 2) + Math.pow(yDelta, 2));
}
