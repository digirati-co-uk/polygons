import { expect, test } from 'vitest';
import { createHelper, type Point } from '../src';

test('a freehand drag with only a release sample retains both endpoints', () => {
  const h = createHelper({ tool: 'pencil', points: [] }, () => {});
  h.pointerDown([100, 100]);
  h.pointerUp([200, 200]);
  expect(h.state.polygon.points).toEqual([[100, 100], [200, 200]]);
  expect(h.state.isOpen).toBe(true);
});

test('a short stroke cannot close a two-point polygon', () => {
  const h = createHelper({ tool: 'pencil', points: [] }, () => {});
  h.pointerDown([100, 100]);
  h.pointerUp([115, 100]);
  expect(h.state.isOpen).toBe(true);
});

test('prepending a stroke preserves the existing segment order and curve controls', () => {
  const original: Point[] = [[100, 100, 40, -20, 160, -20], [300, 100]];
  const h = createHelper({ tool: 'pen', open: true, points: original }, () => {});
  h.setState({ selectedPoints: [0] });
  h.modifiers.set('Alt');
  // Prime the legacy preview before drawing from the endpoint.
  h.pointer([[80, 100]]);
  h.clock.flush();
  h.pointerDown([80, 100]);
  h.pointer([[50, 100]]);
  h.pointerUp([50, 150]);
  expect(h.state.polygon.points).toEqual([[50, 150], [50, 100], ...original]);
  expect(h.state.selectedPoints).toEqual([0]);
  expect(h.state.isOpen).toBe(true);
});
