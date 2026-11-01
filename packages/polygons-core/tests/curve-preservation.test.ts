import { expect, test } from 'vitest';
import { createHelper, type Point } from '../src';

test('closing from the first endpoint reverses curves along with their segments', () => {
  const points: Point[] = [[100, 100, 40, -20, 160, -20], [300, 100], [200, 300]];
  const h = createHelper({ tool: 'pen', open: true, points }, () => {});
  h.setState({ selectedPoints: [0] });
  h.pointerDown([200, 300]);
  h.pointerUp();
  expect(h.state.isOpen).toBe(false);
  expect(h.state.polygon.points).toEqual([[200, 300], [300, 100, -40, -20, -160, -20], [100, 100]]);
  h.history.undo();
  expect(h.state.polygon.points).toEqual(points);
});

test('clicking to stamp scales its curve controls with its anchors', () => {
  const h = createHelper({ tool: 'stamp', points: [] }, () => {});
  h.stamps.set({ open: false, points: [[0, 0, 25, -25, 75, -25], [100, 0], [50, 100]] });
  h.pointerDown([200, 200]);
  h.pointerUp();
  expect(h.state.polygon.points[0]).toEqual([180, 180, 10, -10, 30, -10]);
});
