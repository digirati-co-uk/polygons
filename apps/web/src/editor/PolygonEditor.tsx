import { useEffect, useMemo, useRef, useState } from 'react';
import { type InputShape, type Point, type ValidTools } from 'polygons-core';
import { PolygonOverlay } from './PolygonOverlay';
import { usePolygonEditor } from './use-polygon-editor';

const empty: InputShape = { open: true, points: [] };
const tools: { name: ValidTools; label: string; hint: string }[] = [
  { name: 'pointer', label: 'Select', hint: 'Select, move and resize shapes' },
  { name: 'pen', label: 'Pen', hint: 'Click to add points one at a time' },
  { name: 'box', label: 'Box', hint: 'Draw a rectangle' },
  { name: 'line', label: 'Line', hint: 'Draw a single straight segment' },
  { name: 'lineBox', label: 'Line box', hint: 'Draw a line, then pull out a box from it' },
  { name: 'stamp', label: 'Stamp', hint: 'Place a ready-made shape' },
  { name: 'pencil', label: 'Freehand', hint: 'Drag to draw freehand' },
  { name: 'hand', label: 'Pan', hint: 'Move the view without editing' },
];
export interface PolygonEditorProps {
  shape?: InputShape;
  tool?: ValidTools;
  touch?: boolean;
  boxPlacement?: 'drag' | 'tap';
  snapping?: boolean;
  grid?: boolean;
  bounds?: boolean;
  reticle?: boolean;
  dragOffset?: [number, number];
  width?: number;
  viewBox?: { x: number; y: number; width: number; height: number };
  snapSources?: InputShape[];
  fixedAspectRatio?: boolean;
  title?: string;
  description?: string;
  instructions?: string[];
  inspectorOpen?: boolean;
  onChange?: (shape: InputShape) => void;
  onSourceSelect?: (index: number) => void;
  selectWholeShape?: boolean;
  /** Click empty canvas to clear the selection. */
  canDeselect?: boolean;
}

export function PolygonEditor({
  shape = empty,
  tool = 'pen',
  touch = false,
  boxPlacement = 'drag',
  snapping = false,
  grid = false,
  bounds = false,
  reticle = false,
  dragOffset,
  width,
  viewBox = { x: 0, y: 0, width: 600, height: 400 },
  snapSources = [],
  fixedAspectRatio = false,
  title = 'Make a precise selection.',
  description = 'Draw, snap, and adjust a shape. Every edit is inspectable below.',
  instructions,
  inspectorOpen = false,
  onChange,
  onSourceSelect,
  selectWholeShape = false,
  canDeselect = true,
}: PolygonEditorProps) {
  const svg = useRef<SVGSVGElement>(null);
  const contacts = useRef(new Set<number>());
  const blocked = useRef(false);
  const hovering = useRef(false);
  const [saved, setSaved] = useState<InputShape>(shape);
  const [touchMode, setTouchMode] = useState(touch);
  const [reticleMode, setReticleMode] = useState(reticle);
  const [offset, setOffset] = useState<Point>([0, 0]);
  const {
    helper,
    renderState: state,
    slowState: slow,
    flush,
  } = usePolygonEditor({
    shape,
    tool,
    pointerType: touchMode ? 'touch' : 'mouse',
    boxPlacement,
    dragOffset,
    fixedAspectRatio,
    onChange: (value) => {
      setSaved(value);
      onChange?.(value);
    },
  });
  const x = viewBox.x + offset[0],
    y = viewBox.y + offset[1];
  const centre: Point = [x + viewBox.width / 2, y + viewBox.height / 2];
  function run(action: () => unknown) {
    action();
    flush();
  }
  useEffect(() => {
    setTouchMode(touch);
  }, [touch]);
  useEffect(() => {
    setReticleMode(reticle);
  }, [reticle]);
  useEffect(() => {
    helper.tools.setTool(tool);
    flush();
  }, [tool, helper]);
  useEffect(() => {
    helper.tools.setCanDeselect(canDeselect, false);
    flush();
  }, [canDeselect, helper]);
  useEffect(() => {
    if (selectWholeShape) {
      helper.selectAllPoints();
      flush();
    }
  }, [shape.id, selectWholeShape, helper]);
  useEffect(() => {
    snapping ? helper.snap.enable() : helper.snap.disable();
    grid ? helper.snap.enableGrid() : helper.snap.disableGrid();
    flush();
  }, [snapping, grid, helper]);
  // Serialised once per prop identity (not per pointer move) so equal-but-new arrays don't reset snapping.
  const sourcesKey = useMemo(() => JSON.stringify(snapSources), [snapSources]);
  useEffect(() => {
    helper.snap.setSources(snapSources);
    flush();
  }, [sourcesKey, helper]);
  useEffect(() => {
    helper.setBounds(bounds ? viewBox : null);
    flush();
  }, [bounds, viewBox.x, viewBox.y, viewBox.width, viewBox.height, helper]);
  useEffect(() => {
    helper.setPointerOverride(reticleMode ? centre : null);
    flush();
  }, [reticleMode, x, y, viewBox.width, viewBox.height, helper]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const resize = () => {
      const matrix = el.getScreenCTM();
      if (matrix) {
        helper.setScale(1 / Math.hypot(matrix.a, matrix.b));
        flush();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [helper, viewBox.width, viewBox.height]);
  useEffect(() => {
    // Focus often sits on a toolbar button, so modifier keys would never reach the canvas.
    // While the pointer is over the stage, listen for them globally.
    const names: Record<string, string> = { Shift: 'Shift', Alt: 'Alt', Meta: 'Meta', Control: 'Meta' };
    const down = (event: KeyboardEvent) => {
      if (!hovering.current || !names[event.key] || event.target === svg.current) return;
      run(() => helper.modifiers.set(names[event.key]));
    };
    const up = (event: KeyboardEvent) => {
      if (!names[event.key] || event.target === svg.current) return;
      run(() => helper.modifiers.unset(names[event.key]));
    };
    const reset = () => run(() => helper.modifiers.reset());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [helper]);
  function world(event: { clientX: number; clientY: number }): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }
  const closing = ['close-shape', 'close-shape-line'].includes(slow.actionIntentType || '');
  const hasClosedShape = !state.isOpen && state.polygon.points.length > 0;
  const status = closing
    ? 'Click the highlighted endpoint to close the polygon'
    : slow.boxPending
    ? 'Place the second corner'
    : slow.transitioning
    ? slow.transitionIntentType === 'select-multiple-points'
      ? 'Drag to select the enclosed points'
      : slow.transitionIntentType === 'move-bezier-control'
      ? 'Adjusting curve control · Shift snaps the angle · Alt moves this handle only'
      : slow.transitionIntentType === 'split-line'
      ? state.splitBend
        ? 'Bending the line · release Alt to add a point instead'
        : 'Adding a point · hold Alt to bend the line instead'
      : 'Editing draft'
    : slow.transitionIntentType === 'split-line'
    ? 'Drag from the line to add a point · hold Alt to bend it'
    : slow.currentTool === 'box' && hasClosedShape
    ? 'Drag a handle to resize, or drag inside the box to move it'
    : slow.currentTool === 'box' && slow.boxPlacement === 'tap'
    ? 'Tap the first corner'
    : slow.currentTool === 'box'
    ? 'Drag from one corner to the opposite corner'
    : slow.currentTool === 'pointer' && hasClosedShape
    ? 'Drag to move · drag a handle to resize · click a vertex to edit points'
    : state.isOpen
    ? 'Click to add points, then Finish · hold Shift to snap to curves only'
    : 'Select or drag a handle';
  const curve = helper.curveState(state.selectedPoints);
  const hasPoints = state.polygon.points.length > 0;
  const ratio = viewBox.width / viewBox.height;
  return (
    <section className="polygon-editor" style={{ maxWidth: width || 1000 }}>
      <header>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {instructions && (
        <ol className="scenario-steps" aria-label="Try this">
          {instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <div className="editor-toolbar">
        <div className="toolbar" role="group" aria-label="Drawing tools">
          {tools.map(({ name, label, hint }) => (
            <button
              key={name}
              title={hint}
              aria-pressed={slow.currentTool === name}
              onClick={() => run(() => helper.tools.setTool(name))}
            >
              {label}
            </button>
          ))}
          {slow.currentTool === 'box' && (
            <label className="inline-field">
              Placement
              <select
                aria-label="Box placement"
                value={slow.boxPlacement}
                onChange={(e) => run(() => helper.setBoxPlacement(e.target.value as 'tap' | 'drag'))}
              >
                <option value="drag">Drag</option>
                <option value="tap">Two taps</option>
              </select>
            </label>
          )}
        </div>
        <div className="toolbar-row">
          <div className="toolbar" role="group" aria-label="History">
            <button disabled={!slow.canUndo} onClick={() => run(helper.history.undo)} title="Undo last change">
              Undo
            </button>
            <button disabled={!slow.canRedo} onClick={() => run(helper.history.redo)} title="Redo">
              Redo
            </button>
            <button onClick={() => run(helper.undoLastPoint)} title="Remove the most recently added point">
              Undo point
            </button>
          </div>
          <div className="toolbar" role="group" aria-label="Shape">
            <button
              disabled={!curve.available || curve.curved}
              title="One point: smooth it with handles either side. Two consecutive points: curve the segment between them."
              onClick={() => run(() => helper.setCurveAt(state.selectedPoints))}
            >
              Make curve
            </button>
            <button
              disabled={!curve.available || !curve.anyCurved}
              title="Remove the curve from the selected point or segment"
              onClick={() => run(() => helper.setCurveAt(state.selectedPoints, false))}
            >
              Straighten
            </button>
            <button
              disabled={!helper.canSmoothen(state.selectedPoints)}
              title="Line up the curve handles either side of each selected point so the curve flows through it without a kink"
              onClick={() => run(() => helper.smoothen(state.selectedPoints))}
            >
              Smoothen
            </button>
            <button className="primary" onClick={() => run(() => helper.finishShape())} title="Finish the open shape">
              Finish
            </button>
            <button onClick={() => run(() => helper.cancelGesture())} title="Abandon the gesture in progress (Esc)">
              Cancel gesture
            </button>
            <button
              className="danger"
              disabled={!hasPoints}
              title="Remove the whole shape"
              onClick={() => {
                if (hasPoints && !window.confirm('Clear the shape? This cannot be undone.')) return;
                run(() => {
                  helper.setShape({ open: true, points: [] });
                  helper.tools.setTool('pen');
                });
              }}
            >
              Clear
            </button>
          </div>
          <details className="settings">
            <summary>Settings</summary>
            <div className="settings-panel">
              <label>
                <input type="checkbox" checked={touchMode} onChange={(e) => setTouchMode(e.target.checked)} />
                Touch targets
              </label>
              <label>
                <input type="checkbox" checked={slow.snapEnabled} onChange={() => run(helper.snap.toggle)} />
                Snapping
              </label>
              <label>
                <input type="checkbox" checked={slow.snapToCurves} onChange={() => run(helper.snap.toggleCurves)} />
                Snap to curves
              </label>
              <label>
                <input type="checkbox" checked={slow.snapToGrid} onChange={() => run(helper.snap.toggleGrid)} />
                Grid snap
              </label>
              <label>
                <input type="checkbox" checked={reticleMode} onChange={(e) => setReticleMode(e.target.checked)} />
                Reticle
              </label>
            </div>
          </details>
        </div>
      </div>
      <div className="stage-wrap" style={{ maxWidth: `max(320px, calc((100vh - 340px) * ${ratio}))` }}>
        <span className="stage-status" role="status">
          {status}
        </span>
        <span className="stage-meta">
          {slow.pointerType} · snap {helper.snap.getThreshold()}px
        </span>
      <svg
        ref={svg}
        className="editor-stage"
        aria-label="Polygon drawing surface"
        role="application"
        tabIndex={0}
        viewBox={`${x} ${y} ${viewBox.width} ${viewBox.height}`}
        style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}`, cursor: slow.cursor }}
        data-cursor={slow.cursor}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          contacts.current.add(event.pointerId);
          if (contacts.current.size > 1) {
            blocked.current = true;
            run(() => helper.cancelGesture('second-finger'));
            return;
          }
          if (blocked.current || reticleMode) return;
          // Pick up modifiers held before the press, even if the canvas wasn't focused.
          run(() => {
            if (event.shiftKey) helper.modifiers.set('Shift');
            if (event.altKey) helper.modifiers.set('Alt');
            if (event.metaKey || event.ctrlKey) helper.modifiers.set('Meta');
          });
          event.currentTarget.focus({ preventScroll: true });
          if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
          run(() => {
            helper.setPointerType(
              touchMode
                ? 'touch'
                : event.pointerType === 'touch'
                ? 'touch'
                : event.pointerType === 'pen'
                ? 'pen'
                : 'mouse'
            );
            helper.pointerDown(world(event));
          });
        }}
        onPointerMove={(event) => {
          if (!blocked.current && !reticleMode && (event.buttons === 0 || (event.buttons & 1) !== 0))
            run(() => helper.pointer([world(event)]));
        }}
        onPointerUp={(event) => {
          contacts.current.delete(event.pointerId);
          if (!blocked.current && !reticleMode && event.button === 0) run(() => helper.pointerUp(world(event)));
          if (!contacts.current.size) blocked.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          contacts.current.delete(event.pointerId);
          blocked.current = contacts.current.size > 0;
          run(() => helper.cancelGesture('pointercancel'));
        }}
        onLostPointerCapture={(event) => {
          // A capture can be lost before movement crosses the drag threshold.
          // Normal releases already removed the contact and may retain a tap-box draft.
          if (contacts.current.delete(event.pointerId)) {
            blocked.current = contacts.current.size > 0;
            run(() => helper.cancelGesture('capture-lost'));
          }
        }}
        onBlur={() => {
          if (contacts.current.size || helper.state.slowState.transitioning) {
            blocked.current = contacts.current.size > 0;
            run(() => helper.cancelGesture('blur'));
          }
        }}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onDoubleClick={(event) => run(() => helper.doubleClick(world(event)))}
        onPointerLeave={() => {
          hovering.current = false;
          if (!contacts.current.size && !reticleMode) run(helper.blur);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') run(() => helper.cancelGesture('escape'));
          else if (helper.key.down(event.key)) {
            event.preventDefault();
            flush();
          }
        }}
        onKeyUp={(event) => run(() => helper.key.up(event.key))}
      >
        <PolygonOverlay
          state={state}
          slow={slow}
          viewBox={{ ...viewBox, x, y }}
          sources={snapSources}
          onSourceSelect={onSourceSelect}
          reticle={reticleMode ? centre : undefined}
        />
      </svg>
      </div>
      {reticleMode && (
        <div className="toolbar">
          <button onClick={() => run(() => setOffset([offset[0] - 20, offset[1]]))}>Pan left</button>
          <button onClick={() => run(() => setOffset([offset[0] + 20, offset[1]]))}>Pan right</button>
          <button onClick={() => run(() => setOffset([offset[0], offset[1] + 20]))}>Pan down</button>
          <button onClick={() => run(() => helper.addPointAt(centre))}>Add point</button>
          <button onClick={() => run(() => helper.moveSelectedPointTo(centre))}>Move point here</button>
        </div>
      )}
      <div className="toolbar nudge" role="group" aria-label="Nudge selection">
        <span>Nudge</span>
        {(
          [
            ['←', -1, 0],
            ['↑', 0, -1],
            ['↓', 0, 1],
            ['→', 1, 0],
          ] as const
        ).map(([label, dx, dy]) => (
          <button
            key={label}
            aria-label={`Nudge ${label}`}
            onClick={() => run(() => helper.nudge(dx, dy, { screenPixels: true }))}
          >
            {label}
          </button>
        ))}
        <span className="hint">or use the arrow keys while the canvas is focused</span>
      </div>
      <details open={inspectorOpen || undefined} className="inspector">
        <summary>Live geometry</summary>
        <div className="inspection-grid">
          <div>
            <span>Committed shape</span>
            <output data-testid="shape-state">
              {JSON.stringify({ open: state.isOpen, points: state.polygon.points })}
            </output>
          </div>
          <div>
            <span>Saved shape</span>
            <output data-testid="saved-state">{JSON.stringify(saved)}</output>
          </div>
          <div>
            <span>Interaction</span>
            <output data-testid="interaction-state">
              {JSON.stringify({
                tool: slow.currentTool,
                transitioning: slow.transitioning,
                pending: slow.boxPending,
                selected: state.selectedPoints,
                pointer: state.pointer,
                previewPoint: state.previewPoint,
                cursor: slow.cursor,
                action: slow.actionIntentType,
                transition: slow.transitionIntentType,
                handle: state.activeHandle,
                snapping: state.isSnapping,
                snapPoint: state.snapPoint,
                proximity: slow.modifiers.proximity,
                scale: state.scale,
              })}
            </output>
          </div>
        </div>
      </details>
    </section>
  );
}
