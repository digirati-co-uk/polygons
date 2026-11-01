import { expect, test } from 'vitest';
import { createHelper } from '../src';

test('moving selected vertices to a bound preserves their relative positions in preview and commit', () => {
  const h = createHelper({
    open: false,
    points: [[100, 100], [300, 100], [200, 300]],
    bounds: { x: 0, y: 0, width: 400, height: 400 },
  }, () => {});
  h.setState({ selectedPoints: [0, 1] });
  h.pointerDown([100, 100]);
  h.pointer([[250, 150]]);
  const expected = [[200, 150], [400, 150], [200, 300]];
  expect(h.state.transitionPoints).toEqual(expected);
  h.pointerUp();
  expect(h.state.polygon.points).toEqual(expected);
});

test('fixed-ratio resizing keeps the grab offset when starting near a corner', () => {
  const h = createHelper({
    tool: 'box',
    fixedAspectRatio: true,
    points: [[100, 100], [300, 100], [300, 300], [100, 300]],
  }, () => {});
  h.pointerDown([105, 105]);
  h.pointerUp([65, 65]);
  expect(h.state.polygon.points).toEqual([[60, 60], [300, 60], [300, 300], [60, 300]]);
});
