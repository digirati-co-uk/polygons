import { describe, expect, test, vi } from 'vitest';
import { createHelper, type Point } from '../src';

const triangle: Point[] = [[100, 100], [300, 100], [200, 300]];

describe('interrupting draft edits', () => {
  test('legacy Escape handling cancels a gesture even when deselection is locked', () => {
    const h = createHelper({ tool: 'box', points: [] }, () => {});
    h.pointerDown([100, 100]);
    h.pointer([[200, 200]]);
    expect(h.key.down('Escape')).toBe(true);
    h.pointerUp();
    expect(h.state.polygon.points).toEqual([]);
  });
  test('undo cancels the first draft even without committed history', () => {
    const save = vi.fn();
    const h = createHelper({ tool: 'box', points: [] }, save);
    h.clock.flush();
    save.mockClear();
    h.pointerDown([100, 100]);
    h.pointer([[200, 200]]);
    h.history.undo();
    h.pointerUp();
    h.clock.flush();
    expect(h.state.polygon.points).toEqual([]);
    expect(h.state.transitionPoints).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  test('deleting during a drag cannot be overwritten on release', () => {
    const h = createHelper({ open: false, points: triangle }, () => {});
    h.setState({ selectedPoints: [0] });
    h.pointerDown([100, 100]);
    h.pointer([[150, 150]]);
    h.key.down('Backspace');
    h.pointerUp();
    expect(h.state.polygon.points).toEqual(triangle.slice(1));
    h.history.undo();
    expect(h.state.polygon.points).toEqual(triangle);
  });

  test('a synchronous cancellation from an end listener prevents the commit', () => {
    const h = createHelper({ open: false, points: triangle }, () => {});
    h.emitter.on('polygons.end-transition', () => h.cancelGesture('host-cancelled'));
    h.pointerDown([100, 100]);
    h.pointerUp([150, 150]);
    expect(h.state.polygon.points).toEqual(triangle);
    expect(h.history.canUndo).toBe(false);
  });
});
