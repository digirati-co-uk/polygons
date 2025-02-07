'use client';
import { useEffect, useReducer, useState } from 'react';
import type { Runtime } from '@atlas-viewer/atlas';
import { AtlasAuto, HTMLPortal, ImageService } from '@atlas-viewer/atlas';
import { Vault, parseSelector } from '@iiif/helpers';
import { useSvgEditor } from './_helpers/use-svg-editor';
import { useLocalStorage } from './_helpers/use-local-storage';
import type { ShapeState } from './_helpers/shape-reducer';
import { shapeReducer } from './_helpers/shape-reducer';

// @ts-expect-error
globalThis.IIIF_VAULT = globalThis.IIIF_VAULT || new Vault();

const preset = ['default-preset', { runtimeOptions: { maxOverZoom: 5 } }];

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
  {
    id: 'https://adore.ugent.be/IIIF/images/archive.ugent.be%3A5F2298BA-BF4C-11E1-8DAB-619AAAF23FF7%3ADS.1/info.json',
    width: 5536,
    height: 3857,
  },
];

export default function MainPage() {
  const tileIndex = 4;
  const [runtime, setRuntime] = useState<Runtime | undefined>();
  const image = images[tileIndex];

  const [shapeState, setShapeState] = useState<ShapeState>({
    selectedShape: null,
    shapes: [],
  });

  // SVG STUFF
  const [{ selectedShape, shapes }, dispatch] = useReducer(shapeReducer, shapeState);
  const currentShape = selectedShape !== null ? shapes[selectedShape] : null;

  const {
    helper,
    state,
    defs,
    editor,
    transitionDirection,
    transitionRotate,
    isHoveringPoint,
    isAddingPoint,
    isSplitting,
  } = useSvgEditor(
    {
      currentShape,
      onChange: (newShape) => {
        dispatch({
          type: 'update-current-shape',
          shape: newShape,
        });
      },
      image,
    },
    [selectedShape]
  );

  useEffect(() => {
    setShapeState({ selectedShape, shapes });
  }, [selectedShape, shapes]);

  const mouseMove = (e: any) => {
    helper.pointer([[~~e.atlas.x, ~~e.atlas.y]]);
  };

  const toggleLineMode = () => {
    helper.modes.toggleLineMode();
  };

  const toggleLineBoxMode = () => {
    helper.modes.toggleLineBoxMode();
  };

  const toggleBoxMode = () => {
    helper.modes.toggleBoxMode();
  };

  const addShape = () => {
    dispatch({ type: 'add-shape' });
  };

  const deleteShape = () => {
    dispatch({ type: 'remove-shape' });
  };

  const deselectShape = () => {
    dispatch({ type: 'deselect-shape' });
  };

  const changeShape = (idx: number) => {
    dispatch({ type: 'select-shape', idx });
  };

  const addStamp = () => {
    const points =
      '3657,1179.5 4441.067796610169,1179.5 4441.067796610169,999.03995157385 4307.278450363196,806.1343825665858 4235.716707021792,610.7397094430992 4051.5230024213074,408.4999999999999 3862.351089588378,610.7397094430992 3800.1234866828086,806.1343825665858 3657,1011.4854721549636 3657,1179.5';
    const shapePoints = points.split(' ').map((p) => p.split(',').map((n) => parseFloat(n)));
    helper.stamps.set({
      id: 'custom',
      open: false,
      points: shapePoints as any,
    });
  };

  const showShapes = selectedShape !== null && currentShape?.points.length === 0;

  const clearStamp = () => {
    helper.stamps.clear();
  };

  useEffect(() => {
    return runtime?.world.addLayoutSubscriber((ev, data) => {
      if (ev === 'event-activation' || ev === 'zoom-to' || ev === 'go-home') {
        if (runtime._lastGoodScale && !Number.isNaN(runtime._lastGoodScale)) {
          helper.setScale(1 / runtime._lastGoodScale);
        }
      }
    });
  }, [runtime]);

  const keyDown = (e: any) => {
    const resp = helper.key.down(e.key);
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.showBoundingBox) {
      deleteShape();
    }
    if (resp) {
      e.preventDefault();
    }
  };

  const toggleDrawMode = () => {
    helper.draw.toggle();
  };

  const wrapperClasses: string[] = [];
  if (transitionDirection) {
    wrapperClasses.push(transitionDirection);
  }
  if (isHoveringPoint || state.transitionIntentType === 'move-shape' || state.transitionIntentType === 'move-point') {
    wrapperClasses.push('move');
  }
  if (isAddingPoint) {
    wrapperClasses.push('crosshair');
  }
  if (isSplitting) {
    wrapperClasses.push('copy');
  }
  if (transitionRotate) {
    wrapperClasses.push('rotate');
  }
  if (state.transitionIntentType === 'draw-shape') {
    wrapperClasses.push('draw');
  }

  const selectedButton = { background: 'blue', color: '#fff' };

  return (
    <div
      onKeyDown={keyDown}
      onKeyUp={(e) => {
        helper.key.up(e.key);
      }}
      style={{ display: 'flex', height: '100vh' }}
    >
      <div style={{ width: 400, background: '#fff', padding: 20, overflowY: 'auto', maxWidth: 400 }}>
        <h1>POLYGONS</h1>
        <ul>
          {shapes.map((shape, idx) => {
            return (
              <li
                className={`list-item ${idx === selectedShape ? 'list-item--selected' : ''}`}
                key={idx}
                onClick={() => {
                  changeShape(idx);
                }}
              >
                <div className="poly-thumb">
                  <svg viewBox={`0 0 ${image.width} ${image.height}`}>
                    <polygon points={shape.points.map((r) => r.join(',')).join(' ')} />
                  </svg>
                </div>
                <h3>Shape {idx + 1}</h3>
                {selectedShape === idx ? (
                  <div>
                    <button
                      onClick={() => {
                        deleteShape();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button onClick={addShape}>Add shape</button>
        <button onClick={deselectShape}>Deselect shape</button>
        <button onClick={toggleLineMode}>{state.lineMode ? 'disable' : 'enable'} Line mode</button>
        <button onClick={toggleLineBoxMode}>{state.lineBoxMode ? 'disable' : 'enable'} Line box mode</button>
        <button onClick={toggleBoxMode}>{state.boxMode ? 'disable' : 'enable'} Box mode</button>
        <hr />
        <button
          disabled={state.lineMode || Boolean(state.selectedStamp) || !showShapes || state.drawMode}
          onClick={() => {
            helper.draw.enable();
          }}
          style={!state.lineMode && !state.selectedStamp && showShapes && state.drawMode ? selectedButton : undefined}
        >
          Draw mode
        </button>
        <button
          disabled={state.lineMode || Boolean(state.selectedStamp) || !showShapes || !state.drawMode}
          onClick={() => {
            helper.draw.disable();
          }}
          style={!state.lineMode && !state.selectedStamp && showShapes && !state.drawMode ? selectedButton : undefined}
        >
          Shape mode
        </button>
        <div>
          <hr />
          <button onClick={clearStamp}>None</button>
          <button
            disabled={!showShapes}
            onClick={addStamp}
            style={state.selectedStamp?.id === 'custom' ? selectedButton : undefined}
          >
            Custom
          </button>
          <button
            disabled={!showShapes}
            onClick={() => {
              helper.stamps.triangle();
            }}
            style={state.selectedStamp?.id === 'triangle' ? selectedButton : undefined}
          >
            Triangle
          </button>
          <button
            disabled={!showShapes}
            onClick={() => {
              helper.stamps.square();
            }}
            style={state.selectedStamp?.id === 'square' ? selectedButton : undefined}
          >
            Square
          </button>
          <button
            disabled={!showShapes}
            onClick={() => {
              helper.stamps.hexagon();
            }}
            style={state.selectedStamp?.id === 'hexagon' ? selectedButton : undefined}
          >
            Hexagon
          </button>
          <button
            disabled={!showShapes}
            onClick={() => {
              helper.stamps.circle();
            }}
            style={state.selectedStamp?.id === 'circle' ? selectedButton : undefined}
          >
            Circle
          </button>
        </div>

        <hr />
        <div>Transition intent: {helper.label(state.transitionIntentType)}</div>
        <pre>{JSON.stringify(helper.modifiers.getForType(state.transitionIntentType), null, 2)}</pre>
        <div>Action intent: {helper.label(state.actionIntentType)}</div>
        <pre>{JSON.stringify(helper.modifiers.getForType(state.actionIntentType), null, 2)}</pre>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </div>
      <div className={wrapperClasses.join(' ')} style={{ flex: 1, alignContent: 'stretch', display: 'flex' }}>
        <AtlasAuto
          containerStyle={{ height: '100%', width: '100%', flex: 1 }}
          mode={currentShape ? 'sketch' : 'explore'}
          onCreated={(rt) => {
            setRuntime(rt.runtime);
          }}
          renderPreset={preset as any}
        >
          <world>
            <ImageService key={`tile-${tileIndex}`} {...images[tileIndex]} />
            <world-object
              height={image.height}
              id="shapes"
              key={`shapes-${tileIndex}`}
              onMouseDown={helper.pointerDown}
              onMouseLeave={helper.blur}
              onMouseUp={helper.pointerUp}
              onPointerMove={mouseMove}
              width={image.width}
            >
              {shapes.map((shape, idx) => {
                if (idx === selectedShape || shape.open) {
                  return null;
                }

                const Shape = 'shape' as any;
                return (
                  <Shape
                    id={`shape-${idx}`}
                    points={shape.points}
                    target={{ x: 0, y: 0, width: image.width, height: image.height }}
                    key={idx}
                    // className="shape"
                    onClick={state.transitioning || currentShape?.open ? undefined : () => changeShape(idx)}
                    style={
                      {
                        backgroundColor: 'rgba(119, 24, 196, 0.25)',
                        ':hover': {
                          backgroundColor: 'rgba(119, 24, 196, 0.6)',
                        },
                      } as any
                    }
                  // vectorEffect="non-scaling-stroke"
                  // style={{ pointerEvents: state.transitioning || currentShape?.open ? 'none' : 'visible' }}
                  />
                );
              })}
              <HTMLPortal interactive={false} relative>
                <div style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
                  <svg height="100%" tabIndex={-1} viewBox={`0 0 ${image.width} ${image.height}`} width="100%">
                    <defs>{defs}</defs>

                    {shapes.map((shape, idx) => {
                      if (idx === selectedShape || !shape.open) {
                        return null;
                      }

                      const Shape = 'polyline';
                      return (
                        <Shape
                          className="shape-line"
                          key={idx}
                          onClick={
                            state.transitioning || currentShape?.open
                              ? undefined
                              : () => {
                                changeShape(idx);
                              }
                          }
                          points={shape.points.map((r) => r.join(',')).join(' ')}
                          style={{ pointerEvents: state.transitioning || currentShape?.open ? 'none' : 'visible' }}
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}

                    {editor}
                  </svg>
                </div>
              </HTMLPortal>
            </world-object>
          </world>
        </AtlasAuto>
      </div>
    </div>
  );
}
