import { useEffect, useRef, useState } from 'react';
import type { InputShape, RenderState, SlowState } from 'polygons-core';
import { createSvgHelpers } from 'polygons-core';
import { parseSelector } from '@iiif/helpers';
import { useHelper } from './use-helper';

const svgHelpers = createSvgHelpers();

interface SvgEditorOptions {
  image: { height: number; width: number };
  currentShape: InputShape | null;
  onChange: (e: InputShape) => void;
}

export function useSvgEditor(options: SvgEditorOptions, deps: any[]) {
  const { image, currentShape, onChange } = options;
  const boundingBox = useRef<any>();
  const transitionBoundingBox = useRef<any>();
  const selectBox = useRef<any>();
  const hint = useRef<any>();
  const transitionDraw = useRef<any>();
  const transitionShape = useRef<any>();
  const lineBox = useRef<any>();
  const pointLine = useRef<any>();
  const [transitionDirection, setTransitionDirection] = useState<string | null>(null);
  const [transitionRotate, setTransitionRotate] = useState<boolean>(false);
  const { helper, state } = useHelper(
    currentShape,
    (state: RenderState, slowState: SlowState) => {
      svgHelpers.updateTransitionBoundingBox(transitionBoundingBox.current, state, slowState);
      svgHelpers.updateBoundingBoxPolygon(boundingBox.current, state, slowState);
      svgHelpers.updateTransitionShape(transitionShape.current, state, slowState);
      svgHelpers.updateClosestLinePointTransform(hint.current, state, slowState);
      svgHelpers.updateSelectBox(selectBox.current, state, slowState);
      svgHelpers.updatePointLine(pointLine.current, state, slowState);
      svgHelpers.updateDrawPreview(transitionDraw.current, state, slowState, 3);
      svgHelpers.updateLineBox(lineBox.current, state);
      setTransitionDirection(state.transitionDirection);
      setTransitionRotate(state.transitionRotate);
    },
    onChange
  );

  useEffect(() => {
    helper.setShape(currentShape || null);
  }, deps);

  useEffect(() => {
    const windowBlur = () => {
      helper.modifiers.reset();
    };
    document.addEventListener('mouseleave', windowBlur);
    return () => {
      document.removeEventListener('mouseleave', windowBlur);
    };
  }, []);

  // Paste
  useEffect(() => {
    const onPaste = async (e: any) => {
      e.preventDefault();
      e.stopPropagation();

      const paste = (e.clipboardData || (window as any).clipboardData).getData('text');

      const parsed = parseSelector({
        type: 'SvgSelector',
        value: paste,
      });
      try {
        if (parsed.selector && parsed.selector.type === 'SvgSelector') {
          const points = parsed.selector.points;
          if (points) {
            // 1. We need to translate all the points to 0,0
            let x = Math.min(...points.map((p) => p[0]));
            let y = Math.min(...points.map((p) => p[1]));
            const maxX = Math.max(...points.map((p) => p[0]));
            const maxY = Math.max(...points.map((p) => p[1]));
            const width = maxX - x;
            const height = maxY - y;

            if (helper.state.pointer) {
              x -= helper.state.pointer[0] - width / 2;
              y -= helper.state.pointer[1] - height / 2;
            }
            const newPoints: [number, number][] = points.map((p) => [p[0] - x, p[1] - y]);

            helper.setShape({
              points: newPoints,
              open: false,
            });
          }
        }
      } catch (e) {
        console.log('Error parsing pasted svg');
        console.error(e);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  // Copy
  useEffect(() => {
    const onCopy = async (e: any) => {
      if (!helper.state.polygon.points.length) {
        return;
      }
      e.clipboardData.setData(
        'text/plain',
        `<svg  width="${image.width}" height="${image.height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
          image.width
        } ${image.height}"><g><polygon points="${helper.state.polygon.points
          .map((r) => r.join(','))
          .join(' ')}" /></g></svg>`
      );
      e.preventDefault();
    };

    window.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('copy', onCopy);
    };
  }, []);

  // Default styles for markers.
  const defs = (
    <>
      {/* Marker */}
      <marker id="dot" markerHeight="5" markerWidth="5" refX="5" refY="5" viewBox="0 0 10 10">
        <circle className="marker" cx="5" cy="5" r="4" />
      </marker>
      <marker id="selected" markerHeight="5" markerWidth="5" refX="5" refY="5" viewBox="0 0 10 10">
        <circle cx="5" cy="5" fill="#FAFF00" r="4" />
      </marker>
      <marker id="resizer" markerHeight="5" markerWidth="5" refX="5" refY="5" viewBox="0 0 10 10">
        <rect fill="#fff" height="10" stroke="#FF0DCB" strokeWidth={2} width="10" />
      </marker>
    </>
  );

  const Shape = currentShape ? (currentShape.open ? 'polyline' : 'polygon') : null;
  const isHoveringPoint =
    !state.showBoundingBox && state.closestPoint !== null && state.actionIntentType === 'select-point';
  const isAddingPoint = state.actionIntentType === 'add-open-point';
  const isSplitting = state.transitionIntentType === 'split-line';

  const isStamping = state.transitioning && state.selectedStamp && state.transitionIntentType === 'stamp-shape';

  const editor =
    currentShape && Shape ? (
      <>
        <Shape
          fill={
            !state.transitioning && /*state.pointerInsideShape || */ state.showBoundingBox
              ? 'rgba(255, 0, 0, .5)'
              : 'none'
          }
          markerEnd={!state.showBoundingBox ? 'url(#dot)' : undefined}
          markerMid={!state.showBoundingBox ? 'url(#dot)' : undefined}
          markerStart={!state.showBoundingBox ? 'url(#dot)' : undefined}
          points={currentShape.points.map((r) => r.join(',')).join(' ')}
          stroke="#000"
          strokeWidth={isStamping ? 0 : 2}
          style={{ pointerEvents: 'none' }}
          vectorEffect="non-scaling-stroke"
        />

        {state.lineBoxMode && state.actionIntentType === 'close-line-box' ? (
          <polygon
            fill="rgba(255, 0, 0, .4)"
            ref={lineBox}
            stroke="#000"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {state.transitionIntentType === 'draw-shape' && state.transitioning ? (
          <polyline
            fill="none"
            ref={transitionDraw}
            stroke="rgba(255, 0, 0, .5)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {!state.showBoundingBox && state.selectedPoints && state.selectedPoints.length ? (
          <polyline
            fill="transparent"
            markerEnd="url(#selected)"
            markerMid="url(#selected)"
            markerStart="url(#selected)"
            points={currentShape.points
              .filter((p, idx) => state.selectedPoints.includes(idx))
              .map((r) => r.join(','))
              .join(' ')}
            stroke="transparent"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {isHoveringPoint && state.closestPoint !== null && currentShape.points[state.closestPoint] ? (
          <polyline
            fill="transparent"
            markerEnd="url(#selected)"
            markerMid="url(#selected)"
            markerStart="url(#selected)"
            points={`${currentShape.points[state.closestPoint][0]},${currentShape.points[state.closestPoint][1]}`}
            stroke="transparent"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {!state.transitioning &&
        (state.actionIntentType === 'add-open-point' ||
          state.actionIntentType === 'close-shape' ||
          state.actionIntentType === 'close-shape-line') ? (
          <polyline
            ref={pointLine}
            stroke="#000"
            strokeWidth={state.actionIntentType !== 'close-shape' ? 1 : 2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {state.hasClosestLine && (!state.transitionIntentType || state.transitionIntentType === 'split-line') ? (
          <g ref={hint}>
            <polyline
              fill="transparent"
              markerStart="url(#dot)"
              points="0,0 10,10"
              strokeWidth={2}
              style={{ opacity: 0.5 }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}
        {state.transitioning ? (
          <Shape
            fill={currentShape.open ? 'none' : 'rgba(255, 0, 0, .5)'}
            ref={transitionShape}
            stroke="rgba(255, 0, 0, .5)"
            strokeWidth={currentShape.open ? 2 : 0}
          />
        ) : null}
        {state.transitioning && state.transitionIntentType === 'select-multiple-points' ? (
          <rect
            fill="rgba(255, 255, 255, .3)"
            ref={selectBox}
            stroke="rgba(0,0,0,.2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {!state.showBoundingBox ? (
          <g name="controls">
            {(false as boolean)
              ? currentShape.points.map((point, key) => {
                  const selectedBounds = null;
                  const isActive = (state.selectedPoints || []).includes(key);

                  return (
                    <circle
                      className={`controls ${isActive ? 'controls--selected' : ''}${
                        selectedBounds ? ' controls--bounds' : ''
                      }`}
                      cx={`${(point[0] / image.width) * 100}%`}
                      cy={`${(point[1] / image.height) * 100}%`}
                      key={key}
                      r={isActive && selectedBounds ? 3 : 5}
                    />
                  );
                })
              : null}
          </g>
        ) : null}
        {state.showBoundingBox && !isStamping ? (
          <polygon
            fill="none"
            markerEnd="url(#resizer)"
            markerMid="url(#resizer)"
            markerStart="url(#resizer)"
            ref={boundingBox}
            stroke="#FF0DCB"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </>
    ) : null;

  return {
    helper,
    state,
    isAddingPoint,
    isSplitting,
    isHoveringPoint,
    transitionDirection,
    transitionRotate,
    defs,
    editor,
  };
}
