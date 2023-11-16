'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { AtlasAuto, HTMLPortal, ImageService, Runtime } from '@atlas-viewer/atlas';
import { Vault } from '@iiif/helpers';
import { createSvgHelpers, RenderState, SlowState } from 'polygons-core';
import { useHelper } from '../_helpers/use-helper';
import { simplifyPolygon } from 'polygons-core/src/math';
import { ContourFinder } from 'contours.ts';
import { shapeReducer } from '../_helpers/shape-reducer';

// @ts-ignore
globalThis['IIIF_VAULT'] = globalThis['IIIF_VAULT'] || new Vault();

const svgHelpers = createSvgHelpers();

// const preset: any = ['default-preset', { runtimeOptions: { maxOverZoom: 2 } }];

const images = [
  {
    id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/info.json',
    width: 2569,
    height: 3543,
  },
  {
    id: 'https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~3419~390033/info.json',
    width: 6203,
    height: 7933,
  },
  {
    id: 'https://iiif.ghentcdh.ugent.be/iiif/images/omeka:manifests:8e2ec7e42bf175f1c71ca0847484dfa8f5c6c520/info.json',
    width: 3500,
    height: 2475,
  },
];

const preset = ['default-preset', { runtimeOptions: { maxOverZoom: 5 } }];

const initial =
  '1994.8372880345844,542.9799095046249 1389.7943098831715,541.9712329638949 783.2344834391947,524.3540267228414 782.8283719384256,414.5017713686179 924.8374558739616,394.5354576122192 1896.632633648073,396.2868363004681 1989.796566833351,456.2086183937519'
    .split(' ')
    .map((p) => p.split(',').map((n) => parseFloat(n)));

export default function AtlasPage() {
  const tileIndex = 2;
  const [runtime, setRuntime] = useState<Runtime | undefined>();
  const image = images[tileIndex];

  // SVG STUFF
  const [{ selectedShape, shapes }, dispatch] = useReducer(shapeReducer, {
    shapes: [
      {
        points: initial as any,
        open: false,
      },
    ],
    selectedShape: 0,
  });

  const currentShape = selectedShape !== null ? shapes[selectedShape] : null;
  const boundingBox = useRef<any>();
  const transitionBoundingBox = useRef<any>();
  const selectBox = useRef<any>();
  const hint = useRef<any>();
  const transitionDraw = useRef<any>();
  const transitionShape = useRef<any>();
  const pointLine = useRef<any>();
  const [transitionDirection, setTransitionDirection] = useState<string | null>(null);
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
      setTransitionDirection(state.transitionDirection);
    },
    (newShape) =>
      dispatch({
        type: 'update-current-shape',
        shape: newShape,
      })
  );

  useEffect(() => {
    if (currentShape) {
      helper.setShape(currentShape);
    }
  }, [selectedShape]);

  const mouseMove = (e: any) => {
    helper.pointer([[~~e.atlas.x, ~~e.atlas.y]]);
  };

  const touchStart = (e) => {
    const touch = e.touches[0];
    helper.pointer([[touch.clientX, touch.clientY]]);
    e.preventDefault();
    helper.pointerDown();
  };

  const touchEnd = (e) => {
    e.preventDefault();
    helper.pointerUp();
  };

  const touchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if ((e.touches as TouchList).length > 1) return;
    helper.pointer([[touch.clientX, touch.clientY]]);
  };

  const addShape = () => {
    dispatch({ type: 'add-shape' });
  };

  const removeShape = () => {
    dispatch({ type: 'remove-shape' });
  };

  const onBlur = () => {
    dispatch({ type: 'deselect-shape' });
    helper.blur();
  };

  const changeShape = (idx: number) => {
    dispatch({ type: 'select-shape', idx });
  };
  const Shape = currentShape ? (currentShape.open ? 'polyline' : 'polygon') : null;

  useEffect(() => {
    return runtime?.world.addLayoutSubscriber((ev, data) => {
      if (ev === 'event-activation' || ev === 'zoom-to' || ev === 'go-home') {
        if (runtime._lastGoodScale && !Number.isNaN(runtime._lastGoodScale)) {
          helper.setScale(1 / runtime._lastGoodScale);
        }
      }
    });
  }, [runtime]);

  const isHoveringPoint =
    !state.showBoundingBox && state.closestPoint !== null && state.actionIntentType === 'select-point';

  const isAddingPoint = state.actionIntentType === 'add-open-point';

  const isSplitting = state.transitionIntentType === 'split-line';

  const keyDown = (e: any) => {
    const resp = helper.key.down(e.key);
    if (resp) {
      e.preventDefault();
    }
  };

  const findShapes = async () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const img = new Image();
      img.src = 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/725,/0/default.jpg';
      const canvas = document.createElement('canvas');
      canvas.width = 725;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d');
      ctx!.filter = 'grayscale() contrast(1.5) brightness(1.5)';
      ctx!.drawImage(img, 0, 0, 725, 1000);

      const data = ctx!.getImageData(0, 0, 725, 1000);
      console.log(data);

      const resp = new ContourFinder(data, {
        // blur: true, // blurs the image data
        threshold: 50, // threshold image data
      });

      console.log(resp);
    }
  };

  return (
    <div
      className={`${transitionDirection || ''} ${
        isHoveringPoint || state.transitionIntentType === 'move-shape' ? 'move' : ''
      } ${isAddingPoint ? 'crosshair' : ''} ${isSplitting ? 'copy' : ''}`}
      onKeyDown={keyDown}
      onKeyUp={(e) => helper.key.up(e.key)}
    >
      <AtlasAuto
        onCreated={(rt) => {
          setRuntime(rt.runtime);
        }}
        // renderPreset={preset}
        // runtimeOptions={{ maxOverZoom: scale / 100 }}
        mode={currentShape ? 'sketch' : 'explore'}
        renderPreset={preset as any}
        // renderPreset="default-preset"
        // width={size.width}
        // height={size.height}
        // enableNavigator
      >
        <world>
          <ImageService key={`tile-${tileIndex}`} {...images[tileIndex]} />
          <world-object
            height={image.height}
            width={image.width}
            onPointerMove={mouseMove}
            onMouseDown={helper.pointerDown}
            onMouseUp={helper.pointerUp}
            onMouseLeave={helper.blur}
          >
            <HTMLPortal relative={true} interactive={false}>
              <div style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${image.width} ${image.height}`}
                  // onPointerMove={mouseMove}
                  // onBlur={onBlur}
                  // onMouseDown={helper.pointerDown}
                  // onMouseUp={helper.pointerUp}
                  // onMouseLeave={helper.blur}
                  // onTouchStart={touchStart}
                  // onTouchEnd={touchEnd}
                  // onTouchMove={touchMove}
                  tabIndex={-1}
                >
                  <defs>
                    {/* Marker */}
                    <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                      <circle cx="5" cy="5" r="4" className="marker" />
                    </marker>
                    <marker id="selected" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                      <circle cx="5" cy="5" r="4" fill="#FAFF00" />
                    </marker>
                    <marker id="resizer" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                      <rect width="10" height="10" stroke="#FF0DCB" fill="#fff" strokeWidth={2} />
                    </marker>
                  </defs>
                  {shapes.map((shape, idx) => {
                    const Shape = shape.open ? 'polyline' : 'polygon';
                    return (
                      <Shape
                        key={idx}
                        onClick={idx === selectedShape ? undefined : () => changeShape(idx)}
                        fill={
                          idx === selectedShape &&
                          !state.transitioning &&
                          (state.pointerInsideShape || state.showBoundingBox)
                            ? 'rgba(255, 0, 0, .5)'
                            : 'none'
                        }
                        strokeWidth={2}
                        stroke={idx === selectedShape ? '#000' : '#999'}
                        points={shape.points.map((r) => r.join(',')).join(' ')}
                        vectorEffect="non-scaling-stroke"
                        markerStart={idx === selectedShape && !state.showBoundingBox ? 'url(#dot)' : undefined}
                        markerMid={idx === selectedShape && !state.showBoundingBox ? 'url(#dot)' : undefined}
                        markerEnd={idx === selectedShape && !state.showBoundingBox ? 'url(#dot)' : undefined}
                        style={{ pointerEvents: idx === selectedShape ? 'none' : 'visible' }}
                      />
                    );
                  })}
                  {state.transitionIntentType === 'draw-shape' && state.transitioning ? (
                    <polyline
                      ref={transitionDraw}
                      fill="none"
                      stroke="rgba(255, 0, 0, .5)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {currentShape && Shape ? (
                    <>
                      {!state.showBoundingBox && state.selectedPoints && state.selectedPoints.length ? (
                        <polyline
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          stroke="transparent"
                          markerStart="url(#selected)"
                          markerMid="url(#selected)"
                          markerEnd="url(#selected)"
                          fill="transparent"
                          points={currentShape.points
                            .filter((p, idx) => state.selectedPoints?.includes(idx))
                            .map((r) => r.join(','))
                            .join(' ')}
                        />
                      ) : null}

                      {isHoveringPoint && state.closestPoint ? (
                        <polyline
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          stroke="transparent"
                          markerStart="url(#selected)"
                          markerMid="url(#selected)"
                          markerEnd="url(#selected)"
                          fill="transparent"
                          points={`${currentShape.points[state.closestPoint][0]},${
                            currentShape.points[state.closestPoint][1]
                          }`}
                        />
                      ) : null}

                      {!state.transitioning &&
                      (state.actionIntentType === 'add-open-point' || state.actionIntentType === 'close-shape') ? (
                        <polyline
                          stroke="#000"
                          ref={pointLine}
                          strokeWidth={state.actionIntentType === 'close-shape' ? 2 : 1}
                        />
                      ) : null}
                      {state.hasClosestLine &&
                      (!state.transitionIntentType || state.transitionIntentType === 'split-line') ? (
                        <g ref={hint}>
                          <polyline
                            style={{ opacity: 0.5 }}
                            markerStart="url(#dot)"
                            points="0,0 10,10"
                            vectorEffect="non-scaling-stroke"
                            fill="transparent"
                            strokeWidth={2}
                          />
                        </g>
                      ) : null}
                      {state.transitioning ? (
                        <Shape
                          ref={transitionShape}
                          fill={currentShape.open ? 'none' : 'rgba(255, 0, 0, .5)'}
                          stroke="rgba(255, 0, 0, .5)"
                          strokeWidth={currentShape.open ? 2 : 0}
                        />
                      ) : null}
                      {state.transitioning && state.transitionIntentType === 'select-multiple-points' ? (
                        <rect
                          ref={selectBox}
                          fill="rgba(255, 255, 255, .3)"
                          strokeWidth={1}
                          stroke="rgba(0,0,0,.2)"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                      {!state.showBoundingBox ? (
                        <g name="controls">
                          {(false as boolean) &&
                            currentShape.points.map((point, key) => {
                              const selectedBounds = null;
                              const isActive = (state.selectedPoints || []).includes(key);

                              return (
                                <circle
                                  className={`controls ${isActive ? 'controls--selected' : ''}${
                                    selectedBounds ? ' controls--bounds' : ''
                                  }`}
                                  key={key}
                                  cx={`${(point[0] / image.width) * 100}%`}
                                  cy={`${(point[1] / image.height) * 100}%`}
                                  r={isActive && selectedBounds ? 3 : 5}
                                />
                              );
                            })}
                        </g>
                      ) : null}
                      {state.showBoundingBox ? (
                        <polygon
                          ref={boundingBox}
                          strokeWidth={2}
                          stroke="#FF0DCB"
                          fill="none"
                          markerStart="url(#resizer)"
                          markerMid="url(#resizer)"
                          markerEnd="url(#resizer)"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                    </>
                  ) : null}
                </svg>
              </div>
            </HTMLPortal>
          </world-object>
        </world>
      </AtlasAuto>
      <button onClick={addShape}>Add shape</button>
      <button onClick={findShapes}>Find shapes</button>
      <div>Transition intent: {helper.label(state.transitionIntentType)}</div>
      <div>Action intent: {helper.label(state.actionIntentType)}</div>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <pre>{JSON.stringify({ currentShape }, null, 2)}</pre>
    </div>
  );
}
