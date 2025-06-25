'use client';
import type { Runtime } from '@atlas-viewer/atlas';
import { AtlasAuto, HTMLPortal, ImageService } from '@atlas-viewer/atlas';
import { Vault } from '@iiif/helpers';
import type { ValidTools } from 'polygons-core';
import { useEffect, useReducer, useState } from 'react';
import type { ShapeState } from './_helpers/shape-reducer';
import { shapeReducer } from './_helpers/shape-reducer';
import { useLocalStorage } from './_helpers/use-local-storage';
import { useSvgEditor } from './_helpers/use-svg-editor';

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
    currentTool,
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
    [selectedShape],
  );

  useEffect(() => {
    setShapeState({ selectedShape, shapes });
  }, [selectedShape, shapes]);

  const mouseMove = (e: any) => {
    if (e && e.atlas && typeof e.atlas.x === 'number' && typeof e.atlas.y === 'number') {
      helper.pointer([[~~e.atlas.x, ~~e.atlas.y]]);
    }
  };

  const setTool = (tool: ValidTools) => {
    helper.tools.setTool(tool);
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
    // Auto-select appropriate tool when switching shapes
    if (helper.state.polygon.points.length > 0) {
      helper.tools.autoSelect();
    }
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && state?.showBoundingBox) {
      deleteShape();
    }
    if (resp) {
      e.preventDefault();
    }
  };

  const toggleDrawMode = () => {
    helper.draw.toggle();
  };

  // Use cursor from the tool system
  const wrapperClasses: string[] = [];
  if (transitionDirection) {
    wrapperClasses.push(transitionDirection);
  }
  if (isHoveringPoint || state?.transitionIntentType === 'move-shape' || state?.transitionIntentType === 'move-point') {
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
  if (state?.transitionIntentType === 'draw-shape') {
    wrapperClasses.push('draw');
  }

  // Add the current tool's cursor class
  if (state?.cursor) {
    wrapperClasses.push(state.cursor);
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
        <div style={{ marginBottom: 20 }}>
          <h3>Tools</h3>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() => setTool('pointer')}
              style={currentTool === 'pointer' ? selectedButton : undefined}
              title="Selection tool (V)"
            >
              Select (V)
            </button>
            <button
              onClick={() => setTool('pen')}
              style={currentTool === 'pen' ? selectedButton : undefined}
              title="Pen tool (P)"
            >
              Pen (P)
            </button>
            <button
              onClick={() => setTool('line')}
              style={currentTool === 'line' ? selectedButton : undefined}
              title="Line tool (N)"
            >
              Line (N)
            </button>
            <button
              onClick={() => setTool('box')}
              style={currentTool === 'box' ? selectedButton : undefined}
              title="Box tool (B)"
            >
              Box (B)
            </button>
            <button
              onClick={() => setTool('lineBox')}
              style={currentTool === 'lineBox' ? selectedButton : undefined}
              title="Line Box tool (L)"
            >
              Line Box (L)
            </button>
            <button
              onClick={() => setTool('stamp')}
              style={currentTool === 'stamp' ? selectedButton : undefined}
              title="Stamp tool (S)"
            >
              Stamp (S)
            </button>
            <button
              onClick={() => setTool('hand')}
              style={currentTool === 'hand' ? selectedButton : undefined}
              title="Hand tool (H)"
            >
              Hand (H)
            </button>
            <button
              onClick={() => setTool('pencil')}
              style={currentTool === 'pencil' ? selectedButton : undefined}
              title="Pencil tool (D)"
            >
              Pencil (D)
            </button>
          </div>
        </div>
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
        <button
          onClick={() => helper.tools.clearSelection()}
          disabled={!helper.state.selectedPoints || helper.state.selectedPoints.length === 0}
        >
          Clear Selection
        </button>
        <button
          onClick={() => helper.tools.smartSelect()}
          disabled={!helper.state.polygon?.points || helper.state.polygon.points.length === 0}
        >
          Smart Select
        </button>
        <hr />
        {currentTool === 'pen' && (
          <div>
            <h3>Pen Tool Options</h3>
            <button onClick={toggleDrawMode}>{state?.drawMode ? 'Standard Mode' : 'Draw Mode'}</button>
            <p>
              {helper.state.selectedPoints && helper.state.selectedPoints.length > 0
                ? `Selected ${helper.state.selectedPoints.length} point(s)`
                : helper.state.isOpen
                  ? 'Continue drawing by clicking'
                  : 'Click to start drawing'}
            </p>
          </div>
        )}
        {currentTool === 'pencil' && (
          <div>
            <h3>Pencil Tool Options</h3>
            <p>Draw freehand with the pencil tool</p>
          </div>
        )}
        {currentTool === 'line' && (
          <div>
            <h3>Line Tool Options</h3>
            <button onClick={toggleLineMode}>{state?.lineMode ? 'Disable' : 'Enable'} Line mode</button>
            <p>
              {helper.state.selectedPoints && helper.state.selectedPoints.length > 0
                ? `Selected ${helper.state.selectedPoints.length} point(s)`
                : helper.state.isOpen
                  ? 'Continue line by clicking'
                  : 'Click to start line'}
            </p>
          </div>
        )}
        {currentTool === 'lineBox' && (
          <div>
            <h3>Line Box Tool Options</h3>
            <button onClick={toggleLineBoxMode}>{state?.lineBoxMode ? 'Disable' : 'Enable'} Line box mode</button>
          </div>
        )}
        {currentTool === 'box' && (
          <div>
            <h3>Box Tool Options</h3>
            <button onClick={toggleBoxMode}>{state?.boxMode ? 'Disable' : 'Enable'} Box mode</button>
            <button
              onClick={() => {
                helper.modes.lockAspectRatio();
              }}
              style={state?.fixedAspectRatio ? selectedButton : undefined}
            >
              Fixed Aspect Ratio
            </button>
            <button
              onClick={() => {
                helper.modes.unlockAspectRatio();
              }}
              style={!state?.fixedAspectRatio ? selectedButton : undefined}
            >
              Free Aspect Ratio
            </button>
          </div>
        )}
        {currentTool === 'stamp' && (
          <div>
            <h3>Stamp Tool Options</h3>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button onClick={clearStamp}>None</button>
              <button onClick={addStamp} style={state.selectedStamp?.id === 'custom' ? selectedButton : undefined}>
                Custom
              </button>
              <button
                onClick={() => {
                  helper.stamps.triangle();
                }}
                style={state?.selectedStamp?.id === 'triangle' ? selectedButton : undefined}
              >
                Triangle
              </button>
              <button
                onClick={() => {
                  helper.stamps.square();
                }}
                style={state?.selectedStamp?.id === 'square' ? selectedButton : undefined}
              >
                Square
              </button>
              <button
                onClick={() => {
                  helper.stamps.hexagon();
                }}
                style={state?.selectedStamp?.id === 'hexagon' ? selectedButton : undefined}
              >
                Hexagon
              </button>
              <button
                onClick={() => {
                  helper.stamps.circle();
                }}
                style={state?.selectedStamp?.id === 'circle' ? selectedButton : undefined}
              >
                Circle
              </button>
            </div>
          </div>
        )}

        <hr />
        <h3>Tool Information</h3>
        <div>
          Current Tool: <strong>{currentTool}</strong>
        </div>
        <div>
          Cursor: <strong>{state?.cursor || 'default'}</strong>
        </div>
        <div>
          Points: <strong>{helper.state.polygon?.points?.length || 0}</strong>
        </div>
        <div>
          Selected: <strong>{helper.state.selectedPoints?.length || 0}</strong>
        </div>
        <div>
          Shape: <strong>{helper.state.isOpen ? 'Open' : 'Closed'}</strong>
        </div>

        <h3>Available Actions</h3>
        <div>Transition intent: {helper.label(state?.transitionIntentType)}</div>
        <pre>{JSON.stringify(helper.modifiers.getForType(state?.transitionIntentType), null, 2)}</pre>
        <div>Action intent: {helper.label(state?.actionIntentType)}</div>
        <pre>{JSON.stringify(helper.modifiers.getForType(state?.actionIntentType), null, 2)}</pre>

        <h3>Tool Keyboard Shortcuts</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {Object.entries(helper.tools.shortcuts).map(([tool, key]) =>
            key ? (
              <li key={tool}>
                <strong>{key}</strong>: {tool}
              </li>
            ) : null,
          )}
        </ul>

        <h3>Debug Information</h3>
        <details>
          <summary>State details</summary>
          <pre style={{ fontSize: '10px' }}>{JSON.stringify(state, null, 2)}</pre>
        </details>
      </div>
      <div className={wrapperClasses.join(' ')} style={{ flex: 1, alignContent: 'stretch', display: 'flex' }}>
        <AtlasAuto
          containerStyle={{ height: '100%', width: '100%', flex: 1 }}
          mode={currentShape && state.currentTool !== 'hand' ? 'sketch' : 'explore'}
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
