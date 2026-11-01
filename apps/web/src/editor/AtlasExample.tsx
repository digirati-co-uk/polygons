import './iiif-vault';
import { AtlasAuto, HTMLPortal, ImageService, type Runtime } from '@atlas-viewer/atlas';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { InputShape, Point } from 'polygons-core';
import { PolygonOverlay } from './PolygonOverlay';
import { usePolygonEditor } from './use-polygon-editor';
import { iiifImages, type IIIFImage } from './iiif-images';

const empty: InputShape = { open: true, points: [] };
export function AtlasExample({
  canvasX = 0,
  canvasY = 0,
  image = 'bodleian',
}: {
  canvasX?: number;
  canvasY?: number;
  image?: IIIFImage | 'none';
}) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [saved, setSaved] = useState<InputShape>(empty);
  const [imageError, setImageError] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const contacts = useRef(new Set<number>());
  const blocked = useRef(false);
  const lastPointerType = useRef<'mouse' | 'touch' | 'pen'>('mouse');
  const source = image === 'none' ? null : iiifImages[image];
  const bounds = useMemo(() => ({ x: 0, y: 0, width: source?.width || 600, height: source?.height || 400 }), [source]);
  const { helper, renderState, slowState, flush } = usePolygonEditor({ shape: empty, tool: 'pen', onChange: setSaved });
  useEffect(() => {
    // Keep drawing inside the image, as the playground and workbench do.
    helper.setBounds(bounds);
    flush();
  }, [bounds, helper]);
  function run(fn: () => unknown) {
    fn();
    flush();
  }
  function position(event: MouseEvent & { atlas: { x: number; y: number } }): Point {
    return [event.atlas.x - canvasX, event.atlas.y - canvasY];
  }
  useEffect(() => {
    if (!runtime) return;
    function scale() {
      if (runtime && runtime._lastGoodScale > 0 && Math.abs(helper.state.scale - 1 / runtime._lastGoodScale) > 1e-7) {
        helper.setScale(1 / runtime._lastGoodScale);
        flush();
      }
    }
    scale();
    const unsubscribe = runtime.world.addLayoutSubscriber(scale);
    const unframe = runtime.registerHook('useAfterFrame', scale);
    return () => {
      unsubscribe();
      unframe();
    };
  }, [runtime, helper]);
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const down = (event: PointerEvent) => {
      // Atlas forwards mouse events; the native pointer event is the only place the device type lives.
      lastPointerType.current = event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
      contacts.current.add(event.pointerId);
      if (helper.state.slowState.currentTool === 'hand') setNavigating(true);
      if (contacts.current.size > 1) {
        blocked.current = true;
        run(() => helper.cancelGesture('second-finger'));
      }
    };
    const up = (event: PointerEvent) => {
      contacts.current.delete(event.pointerId);
      if (!contacts.current.size) {
        blocked.current = false;
        setNavigating(false);
      }
    };
    const cancel = (event: PointerEvent) => {
      run(() => helper.cancelGesture('pointercancel'));
      up(event);
    };
    root.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      root.removeEventListener('pointerdown', down, true);
        window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [helper]);
  const localEvent = (event: MouseEvent & { atlas: { x: number; y: number } }, kind: 'down' | 'move' | 'up') => {
    if (blocked.current || helper.state.slowState.currentTool === 'hand') return;
    if (kind !== 'move' && event.button !== 0) return;
    if (kind === 'move' && event.buttons !== 0 && (event.buttons & 1) === 0) return;
    run(() => {
      if (kind === 'down') {
        helper.setPointerType(lastPointerType.current);
        helper.pointerDown(position(event));
      }
      if (kind === 'move') helper.pointer([position(event)]);
      if (kind === 'up') helper.pointerUp(position(event));
    });
  };
  const closing = ['close-shape', 'close-shape-line'].includes(slowState.actionIntentType || '');
  return (
    <section className="polygon-editor atlas-section">
      <header>
        <h1>{source ? 'Annotate the details.' : 'Edit in the viewer.'}</h1>
        <p>
          {source
            ? 'Zoom into the original image, pan to a detail, then draw a polygon or bounding box. Your selection stays attached to the image at every zoom.'
            : `Atlas forwards canvas-local world events. Canvas origin: ${canvasX}, ${canvasY}.`}
        </p>
      </header>
      {source && (
        <ol className="scenario-steps" aria-label="Try this">
          <li>Use Zoom in or the wheel to inspect a small detail.</li>
          <li>Choose Pan to move around; switch to Pen or Box to draw.</li>
          <li>Return to Fit image and check that the annotation stays aligned.</li>
        </ol>
      )}
      <div className="toolbar" aria-label="Atlas editing tools">
        {(
          [
            ['pen', 'Pen'],
            ['box', 'Box'],
            ['pointer', 'Select'],
            ['hand', 'Pan'],
          ] as const
        ).map(([tool, label]) => (
          <button
            key={tool}
            aria-pressed={slowState.currentTool === tool}
            onClick={() => run(() => helper.tools.setTool(tool))}
          >
            {label}
          </button>
        ))}
        <button onClick={() => run(() => helper.finishShape())}>Finish</button>
        <button disabled={!slowState.canUndo} onClick={() => run(helper.history.undo)}>
          Undo
        </button>
        <button disabled={!slowState.canRedo} onClick={() => run(helper.history.redo)}>
          Redo
        </button>
        <button onClick={() => run(() => helper.cancelGesture())}>Cancel gesture</button>
        <button onClick={() => runtime?.world.zoomIn()}>Zoom in</button>
        <button onClick={() => runtime?.world.zoomOut()}>Zoom out</button>
        <button onClick={() => runtime?.world.goHome()}>Fit image</button>
        <label>
          <input type="checkbox" checked={slowState.snapEnabled} onChange={() => run(helper.snap.toggle)} />
          Snapping
        </label>
      </div>
      <div className="stage-heading">
        <span role="status">
          {closing
            ? 'Click the highlighted endpoint to close'
            : slowState.currentTool === 'hand'
            ? 'Drag to pan; use the wheel to zoom'
            : slowState.currentTool === 'box'
            ? 'Drag opposite corners of a bounding box'
            : 'Click to add points; return to the highlighted endpoint to close'}
        </span>
        <span data-testid="atlas-zoom" title="Zoom relative to the full-size image">
          {Math.round(100 / renderState.scale)}% zoom
        </span>
      </div>
      {imageError && (
        <p role="alert" className="image-error">
          Some image tiles could not load. Check the IIIF service link below, then reload the story.
        </p>
      )}
      <div
        ref={stage}
        className="atlas-stage"
        data-testid="atlas-stage"
        tabIndex={0}
        aria-label="Annotation viewer. Press Escape to cancel a gesture."
        onKeyDown={(event) => {
          if (event.key === 'Escape') run(() => helper.cancelGesture('escape'));
          else if (helper.key.down(event.key)) {
            event.preventDefault();
            flush();
          }
        }}
        onKeyUp={(event) => run(() => helper.key.up(event.key))}
        style={{ height: source ? 560 : 440, cursor: navigating ? 'grabbing' : slowState.cursor }}
      >
        <AtlasAuto
          key={image}
          containerStyle={{ width: '100%', height: '100%' }}
          mode={slowState.currentTool === 'hand' ? 'explore' : 'sketch'}
          background="#e7eeeb"
          homePaddingPx={24}
          homePosition={{ ...bounds, x: canvasX, y: canvasY }}
          runtimeOptions={{ maxOverZoom: 8 }}
          onImageError={() => setImageError(true)}
          onReady={() => {
            if (stage.current) stage.current.dataset.ready = 'true';
          }}
          onCreated={(preset) => setRuntime(preset.runtime)}
        >
          {createElement(
            'world',
            {},
            source ? (
              <ImageService
                key={source.info}
                id={source.info}
                width={source.width}
                height={source.height}
                x={canvasX}
                y={canvasY}
              />
            ) : null,
            createElement(
              'world-object',
              {
                id: 'polygon-canvas',
                x: canvasX,
                y: canvasY,
                width: bounds.width,
                height: bounds.height,
                onMouseDown: (event: MouseEvent & { atlas: { x: number; y: number } }) => localEvent(event, 'down'),
                onMouseMove: (event: MouseEvent & { atlas: { x: number; y: number } }) => localEvent(event, 'move'),
                onMouseUp: (event: MouseEvent & { atlas: { x: number; y: number } }) => localEvent(event, 'up'),
                onMouseLeave: () => {
                  if (!contacts.current.size) run(helper.blur);
                },
              },
              !source ? createElement('box', { target: bounds, style: { backgroundColor: '#fff' } }) : null,
              <HTMLPortal relative interactive={false} target={bounds}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${bounds.width} ${bounds.height}`}
                  aria-label="Atlas polygon overlay"
                >
                  <PolygonOverlay state={renderState} slow={slowState} viewBox={bounds} showGrid={!source} />
                </svg>
              </HTMLPortal>
            )
          )}
        </AtlasAuto>
      </div>
      {source && (
        <p className="image-credit">
          <a href={source.info} target="_blank" rel="noreferrer">
            {source.label} · IIIF information
          </a>
          <span>
            {source.width.toLocaleString()} × {source.height.toLocaleString()} pixels. {source.credit}
          </span>
        </p>
      )}
      <details className="inspector">
        <summary>Geometry inspector</summary>
        <output data-testid="atlas-shape">{JSON.stringify(saved)}</output>
        <output data-testid="atlas-interaction">
          {JSON.stringify({
            pointer: renderState.pointer,
            previewPoint: renderState.previewPoint,
            scale: renderState.scale,
            tool: slowState.currentTool,
            cursor: slowState.cursor,
          })}
        </output>
      </details>
    </section>
  );
}
