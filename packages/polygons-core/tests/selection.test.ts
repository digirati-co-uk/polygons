import { expect, test } from 'vitest';
import { createHelper, type Point } from '../src';

const points: Point[] = [[100, 100], [300, 100], [200, 300]];

test('either end vertex of a closed polygon can be selected individually', () => {
  const h = createHelper({ points, open: false }, () => {});
  h.setState({ selectedPoints: [0] });
  h.pointerDown([200, 300]);
  h.pointerUp();
  expect(h.state.selectedPoints).toEqual([2]);
  h.pointerDown([100, 100]);
  h.pointerUp();
  expect(h.state.selectedPoints).toEqual([0]);
});

test('Shift marquee selection keeps vertex indices unique', () => {
  const h = createHelper({ points, open: false }, () => {});
  h.setState({ selectedPoints: [0] });
  h.modifiers.set('Shift');
  h.pointerDown([50, 50]);
  h.pointerUp([350, 150]);
  expect(h.state.selectedPoints).toEqual([0, 1]);
  expect(h.state.slowState.showBoundingBox).toBe(false);
});
