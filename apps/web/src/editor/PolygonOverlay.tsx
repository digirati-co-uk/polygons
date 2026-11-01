import { memo, useCallback, useId, useRef, type PointerEvent } from 'react';
import type { InputShape, Point, RenderState, SlowState } from 'polygons-core';

const noSources: InputShape[] = [];
interface OverlayProps {
  state: RenderState;
  slow: SlowState;
  viewBox: { x: number; y: number; width: number; height: number };
  sources?: InputShape[];
  reticle?: Point;
  showGrid?: boolean;
  onSourceSelect?: (index: number) => void;
}

export function PolygonOverlay({
  state,
  slow,
  viewBox,
  sources = noSources,
  reticle,
  showGrid = true,
  onSourceSelect,
}: OverlayProps) {
  const gridId = useId();
  const { x, y } = viewBox;
  const points = state.polygon.points;
  const draft = state.transitionPoints;
  const visiblePoints = draft || points;
  const closing =
    !slow.transitioning && state.isOpen && ['close-shape', 'close-shape-line'].includes(slow.actionIntentType || '');
  const closePoint = closing ? points[state.selectedPoints[0] === 0 ? points.length - 1 : 0] : null;
  const box = state.transitionBoundingBox || state.polygon.boundingBox;
  const showBox = slow.showBoundingBox && !!box && !state.isOpen;
  const handleSize = 8 * state.scale;
  const grid = state.snapGrid || { spacing: 20 };
  const [gridX, gridY] = typeof grid.spacing === 'number' ? [grid.spacing, grid.spacing] : grid.spacing;
  const [gridOriginX, gridOriginY] = grid.origin || [0, 0];
  const transitioning = slow.transitioning;
  function selectSource(event: PointerEvent<SVGPathElement> | null, index: number) {
    if (onSourceSelect && slow.currentTool === 'pointer' && !transitioning) {
      event?.stopPropagation();
      onSourceSelect(index);
    }
  }
  const latestSelect = useRef(selectSource);
  latestSelect.current = selectSource;
  const onSelectStable = useCallback(
    (event: PointerEvent<SVGPathElement> | null, index: number) => latestSelect.current(event, index),
    []
  );
  return (
    <>
      {showGrid && (
        <>
          <defs>
            <pattern
              id={gridId}
              x={gridOriginX}
              y={gridOriginY}
              width={gridX}
              height={gridY}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M${gridX} 0H0V${gridY}`}
                fill="none"
                stroke={slow.snapToGrid ? '#b6cdd1' : '#d7e2e8'}
                strokeWidth={0.6 * state.scale}
              />
              {slow.snapToGrid && <circle cx="0" cy="0" r={1.2 * state.scale} fill="#8aa9af" />}
            </pattern>
          </defs>
          <rect
            x={x}
            y={y}
            width={viewBox.width}
            height={viewBox.height}
            fill={`url(#${gridId})`}
            pointerEvents="none"
          />
        </>
      )}
      <SourceLayer sources={sources} selectable={!!onSourceSelect && slow.currentTool === 'pointer'} onSelect={onSelectStable} enabled={!!onSourceSelect} />
      <path
        data-testid="committed-shape"
        d={shapePath(points, state.isOpen)}
        fill={state.isOpen ? 'none' : '#157f7540'}
        stroke="#116c64"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {closing && (
        <path
          data-testid="close-preview"
          d={shapePath(points, false)}
          fill="#1baf7426"
          stroke="#087b4d"
          strokeWidth={3}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {draft && (
        <path
          data-testid="draft-shape"
          d={shapePath(draft, state.isOpen && !['stamp-shape', 'tap-box'].includes(slow.transitionIntentType || ''))}
          fill={state.isOpen ? 'none' : '#f0a14122'}
          stroke="#bd6c0c"
          strokeWidth={2}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {state.line?.[0] && !slow.transitioning && !closing && (
        <line
          x1={state.line[0][0]}
          y1={state.line[0][1]}
          x2={state.line[1][0]}
          y2={state.line[1][1]}
          stroke="#116c64"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {state.lineBox && slow.currentTool === 'lineBox' && !slow.transitioning && (
        <path
          data-testid="line-box-preview"
          d={shapePath(state.lineBox, false)}
          fill="#157f7520"
          stroke="#116c64"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {!!state.transitionDraw.length && (
        <polyline
          points={state.transitionDraw.map((p) => `${p[0]},${p[1]}`).join(' ')}
          fill="none"
          stroke="#bd6c0c"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {showBox && box && (
        <g
          data-testid="bounding-box-controls"
          pointerEvents="none"
          transform={
            box.rotation
              ? `rotate(${(box.rotation * 180) / Math.PI} ${box.x + box.width / 2} ${box.y + box.height / 2})`
              : undefined
          }
        >
          <rect
            data-testid="bounding-box"
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="none"
            stroke="#7951ad"
            strokeWidth={1.25}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
          {[
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x + box.width, box.y + box.height],
            [box.x, box.y + box.height],
          ].map(([cx, cy], index) => (
            <rect
              key={index}
              data-testid="bounding-box-handle"
              x={cx - handleSize / 2}
              y={cy - handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={state.scale}
              fill="#fff"
              stroke="#7951ad"
              strokeWidth={1.75}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {!slow.boxMode && (
            <g data-testid="rotation-handle">
              <line
                x1={box.x + box.width}
                y1={box.y}
                x2={box.x + box.width + 24 * state.scale}
                y2={box.y - 24 * state.scale}
                stroke="#7951ad"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={box.x + box.width + 24 * state.scale}
                cy={box.y - 24 * state.scale}
                r={5 * state.scale}
                fill="#fff"
                stroke="#7951ad"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </g>
      )}
      {showBox &&
        box &&
        visiblePoints.map((point, i) =>
          // The square resize handles already mark the box corners; only show vertices elsewhere.
          cornerHandles(box).some(([cx, cy]) => Math.hypot(cx - point[0], cy - point[1]) < handleSize) ? null : (
            <circle
              key={i}
              data-testid={`vertex-hint-${i}`}
              cx={point[0]}
              cy={point[1]}
              r={2.5 * state.scale}
              fill="#116c64"
              fillOpacity={0.55}
              pointerEvents="none"
            />
          )
        )}
      {!showBox &&
        visiblePoints.map((point, i) => (
          <circle
            key={i}
            data-testid={`point-${i}`}
            cx={point[0]}
            cy={point[1]}
            r={4 * state.scale}
            fill={state.selectedPoints.includes(i) ? '#116c64' : '#fff'}
            stroke="#116c64"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      {!showBox &&
        ['pointer', 'pen'].includes(slow.currentTool) &&
        visiblePoints.map((point, pointIndex) => {
          if (point.length !== 6 || (state.isOpen && pointIndex === visiblePoints.length - 1)) return null;
          const next = visiblePoints[(pointIndex + 1) % visiblePoints.length];
          return (
            <g key={pointIndex} data-testid="bezier-controls" pointerEvents="none">
              {([0, 1] as const).map((control) => {
                const index = 2 + control * 2;
                const cx = point[0] + point[index],
                  cy = point[1] + point[index + 1];
                const anchor = control === 0 ? point : next;
                return (
                  <g key={control}>
                    <line
                      x1={anchor[0]}
                      y1={anchor[1]}
                      x2={cx}
                      y2={cy}
                      stroke="#b66c22"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      data-testid={`bezier-control-${pointIndex}-${control}`}
                      cx={cx}
                      cy={cy}
                      r={5 * state.scale}
                      fill="#fff3dd"
                      stroke="#b66c22"
                      strokeWidth={1.75}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      {state.activeSnapGuides.map((guide, i) => (
        <g key={i} data-testid="snap-guide" stroke="#9b3be2" fill="none" strokeWidth={1.5} pointerEvents="none">
          <polyline points={guide.points.map((p) => `${p[0]},${p[1]}`).join(' ')} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {state.previewPoint && !slow.transitioning && !closing && (
        <g
          data-testid="placement-preview"
          data-x={state.previewPoint[0]}
          data-y={state.previewPoint[1]}
          transform={`translate(${state.previewPoint[0]} ${state.previewPoint[1]})`}
          pointerEvents="none"
          stroke={state.isSnapping ? '#9b3be2' : '#116c64'}
          fill="#fff"
          strokeWidth={1.5}
        >
          <circle r={3 * state.scale} vectorEffect="non-scaling-stroke" />
          <path
            d={`M${-9 * state.scale},0h${5 * state.scale}M${4 * state.scale},0h${5 * state.scale}M0,${
              -9 * state.scale
            }v${5 * state.scale}M0,${4 * state.scale}v${5 * state.scale}`}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {closePoint && (
        <g pointerEvents="none">
          <circle
            data-testid="close-target"
            cx={closePoint[0]}
            cy={closePoint[1]}
            r={6 * state.scale}
            fill="#d8f5e7"
            stroke="#087b4d"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {reticle && (
        <g stroke="#222" strokeWidth={1.5} pointerEvents="none">
          <path
            d={`M${reticle[0] - 12 * state.scale},${reticle[1]}h${24 * state.scale}M${reticle[0]},${
              reticle[1] - 12 * state.scale
            }v${24 * state.scale}`}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {state.selectionBox && slow.transitioning && slow.transitionIntentType === 'select-multiple-points' && (
        <rect
          data-testid="selection-marquee"
          {...state.selectionBox}
          fill="#4b8deb24"
          stroke="#356fbd"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </>
  );
}

export function shapePath(points: Point[], open: boolean): string {
  if (!points.length) return '';
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length + (open ? 0 : 1); i++) {
    const prev = points[i - 1],
      point = points[i % points.length];
    path +=
      prev.length === 6
        ? ` C${prev[0] + prev[2]},${prev[1] + prev[3]} ${prev[0] + prev[4]},${prev[1] + prev[5]} ${point[0]},${
            point[1]
          }`
        : ` L${point[0]},${point[1]}`;
  }
  return path + (open ? '' : ' Z');
}

interface SourceLayerProps {
  sources: InputShape[];
  selectable: boolean;
  enabled: boolean;
  onSelect: (event: PointerEvent<SVGPathElement> | null, index: number) => void;
}

/** Re-renders only when the sources or selectability change, not on every pointer move. */
const SourceLayer = memo(function SourceLayer({ sources, selectable, enabled, onSelect }: SourceLayerProps) {
  return (
    <>
      {sources.map((source, i) => {
        const d = shapePath(source.points, source.open);
        return (
          <g key={source.id || i}>
            <path
              data-testid="snap-source"
              d={d}
              fill={source.open ? 'none' : '#dde7e980'}
              stroke="#839ca0"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents={selectable ? 'visiblePainted' : undefined}
              style={{ cursor: selectable ? 'pointer' : 'inherit' }}
              role={enabled ? 'button' : undefined}
              aria-label={enabled ? `Select ${source.id || `annotation ${i + 1}`}` : undefined}
              tabIndex={selectable ? 0 : undefined}
              onKeyDown={(event) => {
                if (selectable && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  onSelect(null, i);
                }
              }}
              onPointerDown={(event) => onSelect(event, i)}
            />
            {selectable && (
              // Wide transparent stroke so thin or open outlines are easy to hit.
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                vectorEffect="non-scaling-stroke"
                pointerEvents="stroke"
                style={{ cursor: 'pointer' }}
                onPointerDown={(event) => onSelect(event, i)}
              />
            )}
          </g>
        );
      })}
    </>
  );
});

/** Corner positions of a (possibly rotated) bounding box in the same space as the points. */
function cornerHandles(box: { x: number; y: number; width: number; height: number; rotation?: number }): Point[] {
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const cos = Math.cos(box.rotation || 0),
    sin = Math.sin(box.rotation || 0);
  return (
    [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height],
      [box.x, box.y + box.height],
    ] as Point[]
  ).map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos] as Point);
}
