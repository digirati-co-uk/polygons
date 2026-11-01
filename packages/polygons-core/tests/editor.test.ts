import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHelper, findAllSnapTargets, updateSnapState, type InputShape, type Point } from '../src';

const triangle: InputShape = {
  open: false,
  points: [
    [100, 100],
    [300, 100],
    [200, 300],
  ],
};
const helpers: ReturnType<typeof createHelper>[] = [];
function editor(input: Parameters<typeof createHelper>[0] = triangle) {
  const save = vi.fn();
  const h = createHelper(input, save);
  helpers.push(h);
  return { h, save };
}
function drag(h: ReturnType<typeof createHelper>, from: Point, to: Point) {
  h.pointerDown(from);
  h.pointer([to]);
  h.pointerUp(to);
}
function pointsOnly(h: ReturnType<typeof createHelper>) {
  h.snap.enable();
  h.snap.disableLines();
  h.snap.disableIntersections();
  h.snap.disableParallel();
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const h of helpers.splice(0)) {
    h.cancelGesture();
    h.clock.stop();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('synchronous gestures', () => {
  test('cold tap works without a frame or hover', () => {
    const { h } = editor({ tool: 'pen', open: true, points: [] });
    h.pointerDown([100, 100]);
    h.pointerUp();
    expect(h.state.polygon.points).toEqual([[100, 100]]);
  });
  test('stationary long tap remains a click', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    h.pointerDown([100, 100]);
    vi.advanceTimersByTime(1000);
    h.pointerUp();
    expect(h.state.polygon.points).toEqual([[100, 100]]);
  });
  test('one movement sample commits its endpoint', () => {
    const { h } = editor();
    drag(h, [100, 100], [150, 150]);
    expect(h.state.polygon.points[0]).toEqual([150, 150]);
  });
  test('release itself supplies the final movement sample', () => {
    const { h } = editor();
    h.pointerDown([100, 100]);
    h.pointerUp([150, 150]);
    expect(h.state.polygon.points[0]).toEqual([150, 150]);
  });
  test('drag slop is measured in screen pixels', () => {
    const { h } = editor();
    h.setScale(4);
    h.pointerDown([100, 100]);
    h.pointer([[120, 120]]);
    expect(h.state.slowState.transitioning).toBe(false);
  });
  test('single vertex is movable with a valid selection', () => {
    const { h } = editor({ tool: 'pen', open: true, points: [[100, 100]] });
    drag(h, [100, 100], [150, 150]);
    expect(h.state.polygon.points).toEqual([[150, 150]]);
    expect(h.state.selectedPoints).toEqual([0]);
  });
  test('invalid pointer samples are ignored', () => {
    const { h } = editor();
    h.pointer([[Infinity, 2]]);
    expect(h.state.pointer).toBeNull();
  });
});

describe('gesture transactions', () => {
  test('a successful box does not also emit cancellation', () => {
    const { h } = editor({ tool: 'box', points: [] });
    const cancel = vi.fn();
    h.emitter.on('polygons.cancel-transition', cancel);
    drag(h, [100, 100], [220, 180]);
    expect(cancel).not.toHaveBeenCalled();
    expect(h.state.slowState.currentTool).toBe('pointer');
  });

  test('stamp creation stays draft until release', () => {
    const { h, save } = editor({ tool: 'box', points: [] });
    h.clock.flush();
    save.mockClear();
    h.pointerDown([100, 100]);
    h.pointer([[220, 180]]);
    h.clock.flush();
    expect(h.state.polygon.points).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(h.state.transitionPoints?.length).toBe(4);
    h.pointerUp();
    h.clock.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
  test('cancelling creation neither saves nor completes it', () => {
    const { h, save } = editor({ tool: 'box', points: [] });
    h.clock.flush();
    save.mockClear();
    const end = vi.fn(),
      cancel = vi.fn();
    h.emitter.on('polygons.end-transition', end);
    h.emitter.on('polygons.cancel-transition', cancel);
    h.pointerDown([100, 100]);
    h.pointer([[220, 180]]);
    h.cancelGesture();
    h.pointerUp();
    h.clock.flush();
    expect(h.state.polygon.points).toEqual([]);
    expect(end).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  test('cancelling movement preserves committed shape and history', () => {
    const { h } = editor();
    h.pointerDown([100, 100]);
    h.pointer([[150, 150]]);
    h.cancelGesture();
    expect(h.state.polygon.points).toEqual(triangle.points);
    expect(h.history.canUndo).toBe(false);
    expect(h.state.transitionPoints).toBeNull();
  });
  test('second pointer cancels and suppresses remaining samples', () => {
    const { h } = editor();
    h.pointerDown([100, 100]);
    h.pointer([[150, 150]]);
    h.pointer([
      [160, 160],
      [250, 250],
    ]);
    h.pointer([[200, 200]]);
    h.pointerUp();
    expect(h.state.polygon.points).toEqual(triangle.points);
    expect(h.state.slowState.transitioning).toBe(false);
  });
  test('blur cancels an active gesture', () => {
    const { h } = editor();
    h.pointerDown([100, 100]);
    h.pointer([[150, 150]]);
    h.blur();
    expect(h.state.pointer).toBeNull();
    expect(h.state.slowState.transitioning).toBe(false);
  });
  test('shape replacement invalidates the previous gesture', () => {
    const { h } = editor();
    h.pointerDown([100, 100]);
    h.pointer([[150, 150]]);
    h.setShape({ id: 'new', open: true, points: [[10, 10]] });
    h.pointer([[200, 200]]);
    h.pointerUp();
    expect(h.state.polygon.points).toEqual([[10, 10]]);
    expect(h.state.selectedPoints).toEqual([]);
    expect(h.state.transitionPoints).toBeNull();
  });
  test('replacement saves the new id', () => {
    const { h, save } = editor({ ...triangle, id: 'old' });
    h.setShape({ ...triangle, id: 'new' });
    expect(save.mock.lastCall?.[0].id).toBe('new');
  });
  test('legacy end listener cannot be overwritten after replacing a shape', () => {
    const { h } = editor();
    h.emitter.on('polygons.end-transition', () => h.setShape({ id: 'new', open: true, points: [[10, 10]] }));
    drag(h, [100, 100], [150, 150]);
    expect(h.state.polygon.points).toEqual([[10, 10]]);
  });
  test('committed event sees applied geometry', () => {
    const { h } = editor();
    const observed: Point[][] = [];
    h.emitter.on('polygons.committed', () => observed.push(h.state.polygon.points));
    drag(h, [100, 100], [150, 150]);
    expect(observed[0][0]).toEqual([150, 150]);
  });
});

describe('history and state', () => {
  test('first undo restores the baseline and stops there', () => {
    const { h } = editor();
    drag(h, [100, 100], [150, 150]);
    h.history.undo();
    expect(h.state.polygon.points).toEqual(triangle.points);
    expect(h.history.canUndo).toBe(false);
    expect(() => h.history.undo()).not.toThrow();
    h.history.redo();
    expect(h.state.polygon.points[0]).toEqual([150, 150]);
  });
  test('editing after undo truncates redo', () => {
    const { h } = editor();
    h.setState({ selectedPoints: [0] });
    h.nudge(1, 0);
    h.nudge(1, 0);
    h.history.undo();
    h.nudge(0, 1);
    expect(h.history.canRedo).toBe(false);
  });
  test('select-all synchronizes both state representations', () => {
    const { h } = editor();
    h.selectAllPoints();
    expect(h.state.selectedPoints).toEqual([0, 1, 2]);
    expect(h.state.slowState.selectedPoints).toEqual([0, 1, 2]);
  });
  test('locks and unlocks apply immediately', () => {
    const { h } = editor();
    h.tools.lockToolSwitching();
    h.tools.setTool('pen');
    expect(h.state.slowState.currentTool).toBe('pointer');
    h.tools.unlockToolSwitching();
    h.tools.setTool('pen');
    expect(h.state.slowState.currentTool).toBe('pen');
  });
  test('tool initialization prepares drawing', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    expect(h.state.isOpen).toBe(true);
  });
  test('snap toggles notify and do not create geometry history', () => {
    const notify = vi.fn();
    const { h } = editor({ ...triangle, onStateChange: notify });
    h.clock.flush();
    notify.mockClear();
    h.key.down('`');
    h.clock.flush();
    expect(notify.mock.lastCall?.[0].snapEnabled).toBe(true);
    expect(h.history.canUndo).toBe(false);
    h.snap.toggle();
    h.snap.toggle();
    expect(h.snap.enabled()).toBe(true);
  });
  test('clock start is idempotent, flush does not schedule', () => {
    const { h } = editor();
    h.clock.flush();
    expect(vi.getTimerCount()).toBe(0);
    h.clock.start();
    h.clock.start();
    expect(vi.getTimerCount()).toBe(1);
    h.clock.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('snapping', () => {
  test('pixel threshold is converted once', () => {
    const { h } = editor();
    pointsOnly(h);
    h.setScale(4);
    expect(h.snap.getThreshold()).toBe(15);
    expect(h.snap.getWorldThreshold()).toBe(60);
    expect(updateSnapState([140, 100], h.state)).toEqual([100, 100]);
  });
  test('open polyline has no phantom closing edge', () => {
    const { h } = editor({
      open: true,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    });
    h.snap.enable();
    h.snap.disablePoints();
    h.snap.disableParallel();
    expect(findAllSnapTargets([50, 50], h.state)).toEqual([]);
  });
  test('moving point excludes both incident edges', () => {
    const { h } = editor({
      open: false,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
    });
    h.snap.enable();
    h.snap.disablePoints();
    h.snap.disableParallel();
    h.setState({ transitionIntentType: 'move-point', selectedPoints: [1] });
    expect(findAllSnapTargets([95, 5], h.state)).toEqual([]);
  });
  test('split source edge exclusion is honored', () => {
    const { h } = editor({
      open: false,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
    });
    h.snap.enable();
    h.snap.disablePoints();
    h.snap.disableParallel();
    expect(updateSnapState([50, 5], h.state, 3, 0)).toBeNull();
  });
  test('exact point match remains active', () => {
    const { h } = editor();
    pointsOnly(h);
    expect(updateSnapState([100, 100], h.state)).toEqual([100, 100]);
  });
  test('grab offset does not offset the snapped vertex', () => {
    const { h } = editor({
      open: false,
      points: [
        [100, 100],
        [200, 100],
        [250, 260],
      ],
    });
    pointsOnly(h);
    drag(h, [105, 105], [198, 102]);
    expect(h.state.polygon.points[0]).toEqual([200, 100]);
  });
  test('Shift keeps axis constraint with snap enabled', () => {
    const { h } = editor();
    h.snap.enable();
    h.modifiers.set('Shift');
    drag(h, [100, 100], [150, 130]);
    expect(h.state.polygon.points[0]).toEqual([150, 100]);
  });
  test('disable immediately clears guides', () => {
    const { h } = editor();
    pointsOnly(h);
    updateSnapState([105, 105], h.state);
    h.snap.disable();
    expect(h.snap.isActive()).toBe(false);
    expect(h.snap.getActiveGuides()).toEqual([]);
  });
  test('external sources and grid work on an empty shape', () => {
    const { h } = editor({ open: true, tool: 'pen', points: [] });
    pointsOnly(h);
    h.snap.setSources([{ open: true, points: [[80, 80]] }]);
    expect(updateSnapState([85, 85], h.state)).toEqual([80, 80]);
    h.snap.setSources([]);
    h.snap.enableGrid();
    h.snap.setGrid({ spacing: 20, origin: [5, 5] });
    expect(updateSnapState([82, 82], h.state)).toEqual([85, 85]);
  });
});

describe('touch and commands', () => {
  test('touch floor follows scale without growing other operation dimensions', () => {
    const { h } = editor({ pointerType: 'touch' });
    expect(h.state.slowState.modifiers.proximity).toBe(22);
    h.setScale(3);
    expect(h.state.slowState.modifiers.proximity).toBe(66);
    h.setPointerType('mouse');
    expect(h.state.slowState.modifiers.proximity).toBe(30);
  });
  test('touch radius is used for selecting points', () => {
    const { h } = editor({ ...triangle, pointerType: 'touch' });
    h.pointerDown([120, 100]);
    h.pointerUp();
    expect(h.state.selectedPoints).toEqual([0]);
  });
  test('tap box commits once on its second tap', () => {
    const { h, save } = editor({ tool: 'box', boxPlacement: 'tap', pointerType: 'touch', points: [] });
    h.clock.flush();
    save.mockClear();
    h.pointerDown([100, 100]);
    h.pointerUp();
    h.clock.flush();
    expect(save).not.toHaveBeenCalled();
    expect(h.state.slowState.boxPending).toBe(true);
    h.pointerDown([220, 180]);
    h.pointerUp();
    h.clock.flush();
    expect(h.state.polygon.points).toEqual([
      [100, 100],
      [100, 180],
      [220, 180],
      [220, 100],
    ]);
    expect(save).toHaveBeenCalledOnce();
    expect(h.state.slowState.currentTool).toBe('pointer');
  });
  test('cancelling first tap clears the pending box', () => {
    const { h } = editor({ tool: 'box', boxPlacement: 'tap', points: [] });
    h.pointerDown([100, 100]);
    h.pointerUp();
    h.cancelGesture();
    expect(h.state.boxPending).toBeNull();
    expect(h.state.transitionPoints).toBeNull();
  });
  test('reticle commands add at supplied positions and finish explicitly', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    for (const p of [
      [100, 100],
      [300, 100],
      [200, 300],
    ] as Point[]) {
      h.setPointerOverride(p);
      h.addPointAt(p);
    }
    expect(h.finishShape()).toBe(true);
    expect(h.state.isOpen).toBe(false);
    expect(h.state.polygon.points.length).toBe(3);
  });
  test('finish rejects a polygon with insufficient vertices', () => {
    const { h } = editor({
      tool: 'pen',
      open: true,
      points: [
        [100, 100],
        [200, 100],
      ],
    });
    expect(h.finishShape()).toBe(false);
    expect(h.state.isOpen).toBe(true);
  });
  test('undo last point handles the prepending endpoint', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    h.addPointAt([100, 100]);
    h.addPointAt([200, 100]);
    h.undoLastPoint();
    expect(h.state.polygon.points).toEqual([[100, 100]]);
    h.undoLastPoint();
    expect(h.state.polygon.points).toEqual([]);
    expect(h.state.isOpen).toBe(true);
  });
  test('screen nudge preserves Bezier offsets', () => {
    const { h } = editor({ open: true, points: [[100, 100, 10, 20, 30, 40]] });
    h.setState({ selectedPoints: [0] });
    h.setScale(3);
    h.nudge(1, -1, { screenPixels: true });
    expect(h.state.polygon.points[0]).toEqual([103, 97, 10, 20, 30, 40]);
  });
  test('offset handle and snap resolve in the same world space', () => {
    const { h } = editor({ ...triangle, pointerType: 'touch', dragOffset: [0, -40] });
    drag(h, [100, 100], [150, 180]);
    expect(h.state.polygon.points[0]).toEqual([150, 140]);
  });
});

describe('geometry safety', () => {
  test('negative-coordinate bounding boxes remain tight', () => {
    const { h } = editor({
      open: false,
      points: [
        [-100, -100],
        [-50, -100],
        [-75, -50],
      ],
    });
    expect(h.state.polygon.boundingBox).toEqual({ x: -100, y: -100, width: 50, height: 50 });
  });
  test('two-point line translation respects bounds', () => {
    const { h } = editor({
      tool: 'line',
      open: true,
      points: [
        [100, 100],
        [300, 100],
      ],
      bounds: { x: 0, y: 0, width: 500, height: 500 },
    });
    drag(h, [200, 100], [-100, 100]);
    expect(h.state.polygon.points).toEqual([
      [0, 100],
      [200, 100],
    ]);
  });
  test('nonzero bounds clamp movement correctly', () => {
    const { h } = editor({
      open: false,
      points: [
        [150, 250],
        [170, 250],
        [160, 270],
      ],
      bounds: { x: 100, y: 200, width: 400, height: 400 },
    });
    h.tools.setTool('hand');
    drag(h, [160, 255], [-1000, -1000]);
    expect(h.state.polygon.boundingBox?.x).toBe(100);
    expect(h.state.polygon.boundingBox?.y).toBe(200);
  });
  test('zero-width geometry remains finite under drag', () => {
    const { h } = editor({
      open: false,
      points: [
        [100, 100],
        [100, 150],
        [100, 200],
        [100, 250],
      ],
    });
    h.selectAllPoints();
    drag(h, [100, 100], [150, 50]);
    expect(h.state.polygon.points.every((p) => p.every(Number.isFinite))).toBe(true);
  });
});

describe('shared resolver integration', () => {
  test('whole-shape translation snaps to an external vertex without self targets', () => {
    const { h } = editor({
      open: false,
      tool: 'hand',
      points: [
        [100, 100],
        [100, 200],
        [200, 200],
        [200, 100],
      ],
    });
    pointsOnly(h);
    h.snap.setSources([{ open: true, points: [[250, 250]] }]);
    drag(h, [150, 150], [198, 198]);
    expect(h.state.polygon.points[2]).toEqual([250, 250]);
  });
  test('multi-point nudge stops at bounds without distorting the shape', () => {
    const { h } = editor({ ...triangle, bounds: { x: 50, y: 50, width: 400, height: 400 } });
    h.selectAllPoints();
    h.nudge(-200, -200);
    expect(h.state.polygon.points).toEqual([
      [50, 50],
      [250, 50],
      [150, 250],
    ]);
  });
  test('fixed-ratio box stays square at a boundary', () => {
    const { h } = editor({
      tool: 'box',
      fixedAspectRatio: true,
      points: [],
      bounds: { x: 0, y: 0, width: 300, height: 200 },
    });
    drag(h, [100, 100], [500, 300]);
    const b = h.state.polygon.boundingBox!;
    expect(b.width).toBe(b.height);
    expect(b.y + b.height).toBeLessThanOrEqual(200);
  });
  test('line-box tap workflow remains available', () => {
    const { h } = editor({ tool: 'lineBox', open: true, points: [] });
    for (const p of [
      [100, 100],
      [300, 100],
      [200, 200],
    ] as Point[]) {
      h.pointerDown(p);
      h.pointerUp();
    }
    expect(h.state.polygon.points).toHaveLength(4);
    expect(h.state.isOpen).toBe(false);
  });
});

test('whole-shape snapping preserves target priority across different anchors', () => {
  const { h } = editor({
    open: false,
    tool: 'hand',
    points: [
      [100, 100],
      [100, 200],
      [200, 200],
      [200, 100],
    ],
  });
  h.snap.enable();
  h.snap.setSources([{ open: true, points: [[250, 250]] }]);
  drag(h, [150, 150], [198, 198]);
  expect(h.state.polygon.points[2]).toEqual([250, 250]);
});

test('bounded resize preserves a fixed non-square aspect ratio', () => {
  const { h } = editor({
    tool: 'box',
    fixedAspectRatio: true,
    open: false,
    points: [
      [100, 100],
      [100, 150],
      [200, 150],
      [200, 100],
    ],
    bounds: { x: 0, y: 0, width: 400, height: 400 },
  });
  drag(h, [200, 150], [500, 500]);
  const box = h.state.polygon.boundingBox!;
  expect(box.width / box.height).toBeCloseTo(2);
  expect(box.x + box.width).toBeLessThanOrEqual(400);
  expect(box.y + box.height).toBeLessThanOrEqual(400);
});

describe('interaction feedback and curve controls', () => {
  test('first-point grid preview agrees with the point committed on click', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    h.snap.enable();
    h.snap.enableGrid();
    h.pointer([[182, 163]]);
    h.clock.flush();
    expect(h.state.previewPoint).toEqual([180, 160]);
    h.pointerDown();
    h.pointerUp();
    expect(h.state.polygon.points[0]).toEqual([180, 160]);
  });
  test('continuing line preview and placement marker use the same grid point', () => {
    const { h } = editor({ tool: 'pen', points: [] });
    h.snap.enable();
    h.snap.enableGrid();
    h.addPointAt([100, 100]);
    h.pointer([[182, 163]]);
    h.clock.flush();
    expect(h.state.line?.[1]).toEqual([180, 160]);
    expect(h.state.previewPoint).toEqual([180, 160]);
  });
  test('close feedback resolves to the endpoint and announces a clickable cursor', () => {
    const { h } = editor({
      tool: 'pen',
      open: true,
      points: [
        [100, 100],
        [300, 100],
        [200, 300],
      ],
    });
    h.tools.smartSelect();
    h.pointer([[103, 103]]);
    h.clock.flush();
    expect(h.state.slowState.actionIntentType).toBe('close-shape');
    expect(h.state.slowState.cursor).toBe('pointer');
    expect(h.state.previewPoint).toEqual([100, 100]);
    expect(h.state.line?.[1]).toEqual([100, 100]);
  });
  test('box handle and moving-shape cursors reflect their intent', () => {
    const { h } = editor({
      tool: 'box',
      open: false,
      points: [
        [100, 100],
        [100, 220],
        [300, 220],
        [300, 100],
      ],
    });
    h.pointer([[300, 220]]);
    h.clock.flush();
    expect(h.state.slowState.cursor).toBe('nwse-resize');
    h.pointerDown([200, 160]);
    h.pointer([[240, 190]]);
    h.clock.flush();
    expect(h.state.slowState.cursor).toBe('grabbing');
  });
  test('curve handles move independently in a draft, commit once, and support undo', () => {
    const curve: InputShape = {
      open: true,
      points: [
        [100, 150, 40, -70, 120, -70],
        [300, 150],
        [350, 300],
      ],
    };
    const { h, save } = editor(curve);
    h.clock.flush();
    save.mockClear();
    h.pointerDown([140, 80]);
    h.pointer([[160, 40]]);
    h.clock.flush();
    expect(h.state.slowState.transitionIntentType).toBe('move-bezier-control');
    expect(h.state.slowState.cursor).toBe('grabbing');
    expect(h.state.polygon.points).toEqual(curve.points);
    expect(save).not.toHaveBeenCalled();
    expect(h.state.transitionPoints?.[0]).toEqual([100, 150, 60, -110, 120, -70]);
    h.pointerUp();
    h.clock.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(h.state.polygon.points[0]).toEqual([100, 150, 60, -110, 120, -70]);
    h.history.undo();
    expect(h.state.polygon.points).toEqual(curve.points);
  });
  test('cancelling a control drag leaves the curve unchanged', () => {
    const curve: InputShape = {
      open: true,
      points: [
        [100, 150, 40, -70, 120, -70],
        [300, 150],
      ],
    };
    const { h } = editor(curve);
    h.pointerDown([220, 80]);
    h.pointer([[250, 40]]);
    h.cancelGesture();
    expect(h.state.polygon.points).toEqual(curve.points);
    expect(h.state.activeBezierControl).toBeNull();
  });
  test('curve conversion and direct control commands retain history', () => {
    const { h } = editor();
    expect(h.setCurve(0)).toBe(true);
    expect(h.state.polygon.points[0].length).toBe(6);
    expect(h.setBezierControl(0, 0, [150, 20])).toBe(true);
    expect(h.state.polygon.points[0].slice(2, 4)).toEqual([50, -80]);
    h.setCurve(0, false);
    expect(h.state.polygon.points[0]).toEqual([100, 100]);
    h.history.undo();
    expect(h.state.polygon.points[0].slice(2, 4)).toEqual([50, -80]);
  });
});

test('enabling an existing curve preserves edited control offsets', () => {
  const { h } = editor({
    open: true,
    points: [
      [100, 100, 30, -60, 120, -40],
      [300, 100],
    ],
  });
  expect(h.setCurve(0, true)).toBe(true);
  expect(h.state.polygon.points[0]).toEqual([100, 100, 30, -60, 120, -40]);
  expect(h.history.canUndo).toBe(false);
});

describe('selection-aware curves', () => {
  const square: InputShape = {
    open: false,
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
  };
  const side = (p: number[]) => [p[2], p[3]];

  test('two consecutive points curve the segment between them, bulging outwards', () => {
    const { h } = editor(square);
    expect(h.curveState([0, 1])).toEqual({ available: true, curved: false, anyCurved: false });
    expect(h.setCurveAt([0, 1])).toBe(true);
    const p = h.state.polygon.points[0];
    expect(p.length).toBe(6);
    // The top edge runs left to right; outwards is up (negative y), and the bulge is small.
    expect(p[3]).toBeLessThan(0);
    expect(p[5]).toBeLessThan(0);
    expect(Math.abs(p[3]!)).toBeLessThan(20);
    expect(h.curveState([0, 1]).curved).toBe(true);
    expect(h.setCurveAt([0, 1], false)).toBe(true);
    expect(h.state.polygon.points[0]).toEqual([0, 0]);
  });

  test('non-adjacent selections cannot be curved', () => {
    const { h } = editor(square);
    expect(h.curveState([0, 2]).available).toBe(false);
    expect(h.setCurveAt([0, 2])).toBe(false);
    expect(h.curveState([0, 1, 2]).available).toBe(false);
  });

  test('a single point gets handles either side along its neighbours tangent', () => {
    const { h } = editor(square);
    expect(h.setCurveAt([1])).toBe(true);
    const prev = h.state.polygon.points[0];
    const point = h.state.polygon.points[1];
    // Tangent at (100,0) runs from (0,0) towards (100,100): direction (1,1)/sqrt2.
    const out = side(point);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeCloseTo(out[1]);
    // The incoming handle (second control on the previous point) mirrors it on the other side.
    const incoming = [prev[4]! - 100, prev[5]! - 0];
    expect(incoming[0]).toBeLessThan(0);
    expect(incoming[0]).toBeCloseTo(incoming[1]);
    expect(h.curveState([1]).curved).toBe(true);
    h.setCurveAt([1], false);
    expect(h.state.polygon.points[0].length).toBe(2);
    expect(h.state.polygon.points[1].length).toBe(2);
  });

  test('shift snaps a dragged control handle to 15 degree steps', () => {
    const { h } = editor(square);
    h.setCurveAt([0, 1]);
    const anchor = h.state.polygon.points[0];
    h.tools.setTool('pointer');
    const control: Point = [anchor[0] + anchor[2]!, anchor[1] + anchor[3]!];
    h.modifiers.set('Shift');
    h.pointerDown(control);
    h.pointer([[control[0] + 31, control[1] + 17]]);
    h.clock.flush();
    expect(h.state.slowState.transitionIntentType).toBe('move-bezier-control');
    h.pointerUp([control[0] + 31, control[1] + 17]);
    h.clock.flush();
    const moved = h.state.polygon.points[0];
    expect(moved).not.toEqual(anchor);
    const angle = (Math.atan2(moved[3]!, moved[2]!) * 180) / Math.PI;
    expect(Math.abs(angle / 15 - Math.round(angle / 15))).toBeLessThan(1e-6);
  });

  test('hovering a line previews the point that will be added', () => {
    const { h } = editor(square);
    h.tools.setTool('pen');
    h.pointer([[50, 2]]);
    h.clock.flush();
    expect(h.state.slowState.transitionIntentType).toBe('split-line');
    expect(h.state.previewPoint?.[1]).toBeCloseTo(0);
    expect(h.state.previewPoint?.[0]).toBeCloseTo(50);
  });
});

test('an open rectangular outline can still be closed by clicking its first point', () => {
  const { h } = editor({ open: true, points: [], tool: 'pen' } as any);
  const pts: Point[] = [[120, 80], [420, 80], [420, 280], [120, 280]];
  for (const p of pts) {
    h.pointer([p]);
    h.clock.flush();
    h.pointerDown(p);
    h.pointerUp(p);
    h.clock.flush();
  }
  h.pointer([[120, 80]]);
  h.clock.flush();
  expect(h.state.slowState.actionIntentType).toBe('close-shape');
  h.pointerDown([120, 80]);
  h.pointerUp([120, 80]);
  h.clock.flush();
  expect(h.state.isOpen).toBe(false);
});

test('axis alignment snaps both dimensions at once, using two different points', () => {
  const { h } = editor({
    open: true,
    points: [
      [100, 300],
      [400, 100],
    ],
  });
  h.snap.enable();
  h.snap.disableLines();
  h.snap.disableIntersections();
  const target: Point = [104, 96];
  const snapped = updateSnapState(target, h.state, 5);
  // x lines up with the first point (100) and y with the second (100).
  expect(snapped).toEqual([100, 100]);
  expect(h.state.activeSnapGuides).toHaveLength(2);
  expect(h.state.activeSnapGuides.every((g) => g.type === 'parallel-line')).toBe(true);
});

describe('bend a line (Alt while dragging out of a line)', () => {
  const square: InputShape = {
    open: false,
    points: [
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
    ],
  };
  function cubic(p: number[], next: number[], t: number) {
    const u = 1 - t;
    const c1 = [p[0]! + p[2]!, p[1]! + p[3]!],
      c2 = [p[0]! + p[4]!, p[1]! + p[5]!];
    return [0, 1].map(
      (k) => u ** 3 * p[k]! + 3 * u * u * t * c1[k]! + 3 * u * t * t * c2[k]! + t ** 3 * next[k]!
    );
  }
  function grab(h: ReturnType<typeof createHelper>) {
    h.tools.setTool('pen');
    h.pointer([[100, 1]]);
    h.clock.flush();
    expect(h.state.slowState.transitionIntentType).toBe('split-line');
  }

  test('Alt bends the segment so the grabbed point follows the pointer, without adding a vertex', () => {
    const { h } = editor(square);
    grab(h);
    expect(h.state.previewPoint).not.toBeNull();
    h.modifiers.set('Alt');
    h.clock.flush();
    expect(h.state.previewPoint).toBeNull();
    h.pointerDown([100, 1]);
    h.pointer([[100, -59]]);
    h.clock.flush();
    // Live draft is already a curve through the pointer.
    expect(h.state.transitionPoints).toHaveLength(4);
    h.pointerUp([100, -59]);
    h.clock.flush();
    const pts = h.state.polygon.points;
    expect(pts).toHaveLength(4);
    expect(pts[0]).toHaveLength(6);
    const mid = cubic(pts[0], pts[1], 0.5);
    // The grabbed spot (100, 0) moves by the pointer's travel (-60).
    expect(mid[0]).toBeCloseTo(100, 0);
    expect(mid[1]).toBeCloseTo(-60, 0);
    // Both control points moved out together.
    expect(pts[0][3]).toBeLessThan(0);
    expect(pts[0][5]).toBeLessThan(0);
    expect(h.state.selectedPoints).toEqual([0, 1]);
    h.history.undo();
    expect(h.state.polygon.points[0]).toEqual([0, 0]);
  });

  test('without Alt the same drag still inserts a vertex', () => {
    const { h } = editor(square);
    grab(h);
    h.pointerDown([100, 1]);
    h.pointer([[100, -59]]);
    h.pointerUp([100, -59]);
    h.clock.flush();
    expect(h.state.polygon.points).toHaveLength(5);
  });

  test('Alt can be pressed and released mid-drag to switch between bend and split', () => {
    const { h } = editor(square);
    grab(h);
    h.pointerDown([100, 1]);
    h.pointer([[100, -59]]);
    h.clock.flush();
    expect(h.state.transitionPoints).toHaveLength(5);
    h.modifiers.set('Alt');
    h.pointer([[100, -60]]);
    h.clock.flush();
    expect(h.state.transitionPoints).toHaveLength(4);
    h.modifiers.unset('Alt');
    h.pointer([[100, -61]]);
    h.clock.flush();
    expect(h.state.transitionPoints).toHaveLength(5);
    h.cancelGesture();
    expect(h.state.polygon.points).toHaveLength(4);
  });

  test('bending an already-curved segment moves its existing controls', () => {
    const { h } = editor(square);
    h.setCurveAt([0, 1]);
    const before = [...h.state.polygon.points[0]];
    h.tools.setTool('pen');
    h.pointer([[100, -12]]);
    h.clock.flush();
    h.modifiers.set('Alt');
    h.pointerDown([100, -12]);
    h.pointer([[100, -70]]);
    h.pointerUp([100, -70]);
    h.clock.flush();
    const pts = h.state.polygon.points;
    expect(pts).toHaveLength(4);
    expect(pts[0][3]).toBeLessThan(before[3]!);
  });
});

describe('smoothen', () => {
  const kinked: InputShape = {
    open: false,
    points: [
      [0, 0, 60, -40, 140, -40],
      [200, 0, 40, 100, 40, 160],
      [200, 200],
      [0, 200],
    ],
  };
  const handles = (h: ReturnType<typeof createHelper>, i: number) => {
    const pts = h.state.polygon.points;
    const p = pts[i]!;
    const prev = pts[(i + pts.length - 1) % pts.length]!;
    return {
      out: [p[2]!, p[3]!],
      inn: [prev[0]! + prev[4]! - p[0]!, prev[1]! + prev[5]! - p[1]!],
    };
  };

  test('aligns both handles through a kinked point and keeps their lengths', () => {
    const { h } = editor(kinked);
    const before = handles(h, 1);
    expect(h.canSmoothen([1])).toBe(true);
    expect(h.smoothen([1])).toBe(true);
    const { out, inn } = handles(h, 1);
    expect(out[0]! * inn[1]! - out[1]! * inn[0]!).toBeCloseTo(0, 5);
    expect(out[0]! * inn[0]! + out[1]! * inn[1]!).toBeLessThan(0);
    expect(Math.hypot(...(out as [number, number]))).toBeCloseTo(Math.hypot(before.out[0]!, before.out[1]!));
    expect(Math.hypot(...(inn as [number, number]))).toBeCloseTo(Math.hypot(before.inn[0]!, before.inn[1]!));
    expect(h.canSmoothen([1])).toBe(false);
    h.history.undo();
    expect(handles(h, 1).out).toEqual(before.out);
  });

  test('a curved handle next to a straight edge lines up with that edge', () => {
    const { h } = editor(kinked);
    // Point 3 sits between two straight edges: nothing to align.
    expect(h.canSmoothen([3])).toBe(false);
    // Point 0 is curved outwards and its incoming edge (from point 3) is straight, so the handle
    // should continue the straight edge 3 -> 0, i.e. point straight up (negative y).
    expect(h.smoothen([0])).toBe(true);
    const { out } = handles(h, 0);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeLessThan(0);
  });

  test('works on several points, and a straight shape has nothing to smoothen', () => {
    const { h } = editor(kinked);
    expect(h.smoothen([0, 1])).toBe(true);
    const a = handles(h, 0),
      b = handles(h, 1);
    expect(a.out[0]).toBeCloseTo(0, 5); // lined up with the straight edge 3 -> 0
    expect(b.out[0]! * b.inn[1]! - b.out[1]! * b.inn[0]!).toBeCloseTo(0, 5);
    expect(editor(triangle).h.canSmoothen([0, 1, 2])).toBe(false);
  });
});

describe('Dragging a control handle', () => {
  const curved: InputShape = {
    open: false,
    points: [
      [0, 0, 20, -60, 60, -60],
      [200, 0, 60, 40, 0, 120],
      [200, 200],
      [0, 200],
    ],
  };
  const drag = (h: ReturnType<typeof createHelper>, from: Point, to: Point, alt: boolean) => {
    h.tools.setTool('pointer');
    if (alt) h.modifiers.set('Alt');
    h.pointerDown(from);
    h.pointer([to]);
    h.clock.flush();
    h.pointerUp(to);
    h.clock.flush();
    h.modifiers.unset('Alt');
  };

  test('the opposite handle on the same anchor mirrors the dragged one: collinear and the same length', () => {
    const { h } = editor(curved);
    // Point 1 at (200,0): its outgoing handle is at (260,40); incoming is point 0's second handle at (60,-60).
    drag(h, [260, 40], [300, 100], false);
    const out = [h.state.polygon.points[1]![2]!, h.state.polygon.points[1]![3]!];
    const p0 = h.state.polygon.points[0]!;
    const inn = [p0[0]! + p0[4]! - 200, p0[1]! + p0[5]! - 0];
    expect(out[0]).toBeCloseTo(100);
    expect(out[1]).toBeCloseTo(100);
    expect(out[0]! * inn[1]! - out[1]! * inn[0]!).toBeCloseTo(0, 4);
    expect(out[0]! * inn[0]! + out[1]! * inn[1]!).toBeLessThan(0);
    expect(inn[0]).toBeCloseTo(-100, 4);
    expect(inn[1]).toBeCloseTo(-100, 4);
    expect(Math.hypot(inn[0]!, inn[1]!)).toBeCloseTo(Math.hypot(out[0]!, out[1]!), 4);
    h.history.undo();
    expect(h.state.polygon.points[0]).toEqual(curved.points[0]);
  });

  test('with Alt only the dragged handle moves', () => {
    const { h } = editor(curved);
    drag(h, [260, 40], [300, 100], true);
    expect(h.state.polygon.points[0]).toEqual(curved.points[0]);
  });

  test('dragging a second control also moves the next point\'s outgoing handle', () => {
    const { h } = editor(curved);
    // Point 0's second handle sits at (60,-60), attached to point 1 at (200,0).
    drag(h, [60, -60], [120, -100], false);
    const p1 = h.state.polygon.points[1]!;
    const p0 = h.state.polygon.points[0]!;
    const inn = [p0[0]! + p0[4]! - 200, p0[1]! + p0[5]!];
    const out = [p1[2]!, p1[3]!];
    expect(out[0]! * inn[1]! - out[1]! * inn[0]!).toBeCloseTo(0, 4);
    expect(Math.hypot(out[0]!, out[1]!)).toBeCloseTo(Math.hypot(inn[0]!, inn[1]!), 4);
  });

  test('a straight opposite side is left alone', () => {
    const { h } = editor(curved);
    // Point 0's incoming side (edge 3 -> 0) is straight: nothing to mirror.
    drag(h, [20, -60], [40, -90], false);
    expect(h.state.polygon.points[3]).toEqual([0, 200]);
  });
});

test('curve handles cannot be grabbed while the whole shape is selected', () => {
  const shape: InputShape = {
    open: false,
    points: [
      [100, 100, 40, -60, 120, -60],
      [300, 100],
      [200, 300],
    ],
  };
  const { h } = editor(shape);
  h.tools.setTool('pointer');
  h.selectAllPoints();
  h.clock.flush();
  expect(h.state.slowState.showBoundingBox).toBe(true);
  h.pointer([[140, 40]]);
  h.clock.flush();
  expect(h.state.slowState.transitionIntentType).not.toBe('move-bezier-control');
  // Selecting a single point brings the handles back.
  h.state.selectedPoints = [0];
  h.tools.setTool('pen');
  h.clock.flush();
  h.pointer([[141, 41]]);
  h.clock.flush();
  expect(h.state.slowState.showBoundingBox).toBe(false);
  expect(h.state.slowState.transitionIntentType).toBe('move-bezier-control');
});

describe('canDeselect', () => {
  const click = (h: ReturnType<typeof createHelper>, p: Point) => {
    h.pointer([p]);
    h.clock.flush();
    h.pointerDown(p);
    h.pointerUp(p);
    h.clock.flush();
  };
  test('clicking empty space clears the selection only when enabled, without selecting everything', () => {
    const { h } = editor();
    h.tools.setTool('pointer');
    h.selectAllPoints();
    click(h, [600, 600]);
    expect(h.state.selectedPoints).toHaveLength(3);
    h.tools.setCanDeselect(true, false);
    click(h, [600, 600]);
    expect(h.state.selectedPoints).toEqual([]);
  });
  test('works for a rectangle too, and enabling it does not change the selection', () => {
    const { h } = editor({
      open: false,
      points: [
        [100, 100],
        [300, 100],
        [300, 300],
        [100, 300],
      ],
    });
    h.tools.setTool('pointer');
    h.tools.setCanDeselect(true, false);
    expect(h.state.selectedPoints).toEqual([]);
    h.selectAllPoints();
    click(h, [600, 600]);
    expect(h.state.selectedPoints).toEqual([]);
  });
});

describe('double click', () => {
  const shape: InputShape = {
    open: false,
    points: [
      [0, 0, 60, -40, 140, -40],
      [200, 0, 40, 100, 40, 160],
      [200, 200],
      [0, 200],
    ],
  };
  test('smoothens a point with curve handles', () => {
    const { h } = editor(shape);
    h.tools.setTool('pointer');
    expect(h.doubleClick([201, 2])).toBe(true);
    const pts = h.state.polygon.points;
    const out = [pts[1]![2]!, pts[1]![3]!];
    const inn = [pts[0]![0]! + pts[0]![4]! - 200, pts[0]![1]! + pts[0]![5]!];
    expect(out[0]! * inn[1]! - out[1]! * inn[0]!).toBeCloseTo(0, 5);
    expect(h.state.selectedPoints).toEqual([1]);
    // Already smooth: a second double click does nothing.
    expect(h.doubleClick([200, 0])).toBe(false);
    h.history.undo();
    expect(h.state.polygon.points[1]).toEqual(shape.points[1]);
  });
  test('ignores empty space and points without curves', () => {
    const { h } = editor(shape);
    expect(h.doubleClick([500, 500])).toBe(false);
    expect(h.doubleClick([0, 200])).toBe(false);
    expect(h.state.polygon.points).toEqual(shape.points);
  });
});

describe('handles travel with the points they belong to', () => {
  // abs position of a segment's incoming (second) handle
  const incoming = (h: ReturnType<typeof createHelper>, from: number) => {
    const p = h.state.polygon.points[from]!;
    return [p[0]! + p[4]!, p[1]! + p[5]!];
  };
  const curved: InputShape = {
    open: false,
    points: [
      [0, 0, 60, -40, 140, -40],
      [200, 0, 40, 100, 40, 160],
      [200, 200],
      [0, 200],
    ],
  };
  test('dragging a point moves both of its handles', () => {
    const { h } = editor(curved);
    h.tools.setTool('pointer');
    const before = incoming(h, 0); // belongs to point 1
    h.selectAllPoints();
    h.state.selectedPoints = [1];
    h.pointerDown([200, 0]);
    h.pointer([[230, 30]]);
    h.clock.flush();
    h.pointerUp([230, 30]);
    h.clock.flush();
    expect(h.state.polygon.points[1]!.slice(0, 2)).toEqual([230, 30]);
    const after = incoming(h, 0);
    expect(after[0]).toBeCloseTo(before[0]! + 30);
    expect(after[1]).toBeCloseTo(before[1]! + 30);
    // Its outgoing handle keeps its offset; the far handle (owned by the next point) stays put in absolute terms.
    expect(h.state.polygon.points[1]!.slice(2, 4)).toEqual([40, 100]);
    expect(230 + h.state.polygon.points[1]![4]!).toBeCloseTo(240);
    expect(30 + h.state.polygon.points[1]![5]!).toBeCloseTo(160);
  });
  test('nudging a point moves both of its handles', () => {
    const { h } = editor(curved);
    h.state.selectedPoints = [1];
    const before = incoming(h, 0);
    h.nudge(5, -3);
    const after = incoming(h, 0);
    expect(after[0]).toBeCloseTo(before[0]! + 5);
    expect(after[1]).toBeCloseTo(before[1]! - 3);
  });
  test('moving every point just translates the shape', () => {
    const { h } = editor(curved);
    h.state.selectedPoints = [0, 1, 2, 3];
    h.nudge(10, 10);
    expect(h.state.polygon.points[0]!.slice(2)).toEqual([60, -40, 140, -40]);
  });
  test('dragging out of a curved edge keeps the curve shape', () => {
    const { h } = editor(curved);
    h.tools.setTool('pen');
    const sample = (p: number[], q: number[], t: number) => {
      const u = 1 - t;
      return [0, 1].map(
        (k) =>
          u ** 3 * p[k]! +
          3 * u * u * t * (p[k]! + p[2 + k]!) +
          3 * u * t * t * (p[k]! + p[4 + k]!) +
          t ** 3 * q[k]!
      );
    };
    const mid = sample(curved.points[0]!, curved.points[1]!, 0.5);
    h.pointer([[mid[0]!, mid[1]!]]);
    h.clock.flush();
    expect(h.state.slowState.transitionIntentType).toBe('split-line');
    h.pointerDown([mid[0]!, mid[1]!]);
    h.pointer([[mid[0]!, mid[1]!]]); // no travel yet is below the drag threshold, so move a little
    h.pointer([[mid[0]! + 0.01, mid[1]! + 12]]);
    h.clock.flush();
    // Before the point is dragged much, the two halves together still trace the original curve.
    const draft = h.state.transitionPoints!;
    expect(draft).toHaveLength(5);
    expect(draft[1]).toHaveLength(6);
    h.cancelGesture();
  });
});

describe('snapping to curves', () => {
  // A single curved edge from (0,0) to (200,0) bulging up to y = -60 at its middle (t = 0.5).
  const curve: InputShape = {
    id: 'curve',
    open: true,
    points: [
      [0, 0, 0, -80, 200, -80],
      [200, 0],
    ],
  };
  const setup = () => {
    const { h } = editor({ open: true, points: [] });
    h.snap.enable();
    h.snap.disablePoints();
    h.snap.disableIntersections();
    h.snap.disableParallel();
    h.snap.setSources([curve]);
    return h;
  };
  test('on by default, and a point near the curve snaps onto the curve rather than its chord', () => {
    const h = setup();
    expect(h.snap.curvesEnabled()).toBe(true);
    // Mid-curve is at (100, -60); the chord is y = 0, 60 away, so only the curve is in range.
    const snapped = updateSnapState([100, -52], h.state, 3);
    expect(snapped).not.toBeNull();
    expect(snapped![1]).toBeLessThan(-55);
    expect(snapped![1]).toBeGreaterThan(-61);
    // The guide traces the curve.
    expect(h.state.activeSnapGuides[0].type).toBe('line');
    expect(h.state.activeSnapGuides[0].points.length).toBeGreaterThan(10);
  });
  test('can be switched off, and then a curved edge is not snapped at all', () => {
    const h = setup();
    h.snap.disableCurves();
    expect(updateSnapState([100, -52], h.state, 3)).toBeNull();
    // Nor does the invisible chord attract the pointer.
    expect(updateSnapState([100, -3], h.state, 3)).toBeNull();
  });
  test('straight edges are still governed by the lines option', () => {
    const { h } = editor({ open: true, points: [] });
    h.snap.enable();
    h.snap.disablePoints();
    h.snap.disableIntersections();
    h.snap.disableParallel();
    h.snap.setSources([{ open: true, points: [[0, 0], [200, 0]] }]);
    expect(updateSnapState([100, -3], h.state, 3)).not.toBeNull();
    h.snap.disableLines();
    expect(updateSnapState([100, -3], h.state, 3)).toBeNull();
  });
});

describe('Shift snaps to curves only', () => {
  const sources: InputShape[] = [
    { id: 'curve', open: true, points: [[0, 0, 0, -80, 200, -80], [200, 0]] },
    { id: 'square', open: false, points: [[300, 0], [400, 0], [400, 100], [300, 100]] },
  ];
  const setup = (snapping: boolean) => {
    const { h } = editor({ open: true, points: [] });
    h.tools.setTool('pen');
    if (snapping) h.snap.enable();
    h.snap.setSources(sources);
    return h;
  };
  const hover = (h: ReturnType<typeof createHelper>, p: Point) => {
    h.pointer([p]);
    h.clock.flush();
    return h.state.previewPoint;
  };

  test('with Shift held, a curve snaps even when snapping is off and the curves option is off', () => {
    const h = setup(false);
    h.snap.disableCurves();
    expect(hover(h, [100, -52])![1]).toBeCloseTo(-52); // no snap without Shift
    h.modifiers.set('Shift');
    const p = hover(h, [100, -52])!;
    expect(p[1]).toBeLessThan(-55);
    expect(p[1]).toBeGreaterThan(-61);
    h.modifiers.unset('Shift');
    expect(hover(h, [100, -52])![1]).toBeCloseTo(-52);
  });

  test('with Shift held, vertices and straight edges stop snapping', () => {
    const h = setup(true);
    // Near the square's corner (300, 0) and along its top edge.
    expect(hover(h, [303, 2])).toEqual([300, 0]);
    h.modifiers.set('Shift');
    expect(hover(h, [303, 2])).toEqual([303, 2]);
    expect(hover(h, [350, 3])).toEqual([350, 3]);
  });

  test('placing a point with Shift held lands on the curve', () => {
    const h = setup(false);
    h.modifiers.set('Shift');
    h.pointer([[100, -52]]);
    h.clock.flush();
    h.pointerDown([100, -52]);
    h.pointerUp([100, -52]);
    h.clock.flush();
    const placed = h.state.polygon.points[0]!;
    expect(placed[1]).toBeLessThan(-55);
    expect(placed[1]).toBeGreaterThan(-61);
  });
});
