'use client';
import { useEffect, useReducer, useState } from 'react';
import { AtlasAuto, HTMLPortal, ImageService, Runtime } from '@atlas-viewer/atlas';
import { Vault } from '@iiif/helpers';
import { useSvgEditor } from '../_helpers/use-svg-editor';
import { shapeReducer } from '../_helpers/shape-reducer';

// @ts-ignore
globalThis['IIIF_VAULT'] = globalThis['IIIF_VAULT'] || new Vault();

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

const preset = ['default-preset', { runtimeOptions: { maxOverZoom: 5 } }];

export default function AtlasPage() {
  const tileIndex = 4;
  const [runtime, setRuntime] = useState<Runtime | undefined>();
  const image = images[tileIndex];

  // SVG STUFF
  const [{ selectedShape, shapes }, dispatch] = useReducer(shapeReducer, {
    shapes: [],
    selectedShape: null,
  });
  const currentShape = selectedShape !== null ? shapes[selectedShape] : null;

  const { helper, state, defs, editor, transitionDirection, isHoveringPoint, isAddingPoint, isSplitting } =
    useSvgEditor(
      {
        currentShape,
        onChange: (newShape) =>
          dispatch({
            type: 'update-current-shape',
            shape: newShape,
          }),
        image,
      },
      [selectedShape]
    );

  const mouseMove = (e: any) => {
    helper.pointer([[~~e.atlas.x, ~~e.atlas.y]]);
  };

  const addShape = () => {
    dispatch({ type: 'add-shape' });
  };

  const changeShape = (idx: number) => {
    dispatch({ type: 'select-shape', idx });
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
    if (resp) {
      e.preventDefault();
    }
  };

  const wrapperClasses: string[] = [];
  if (transitionDirection) {
    wrapperClasses.push(transitionDirection);
  }
  if (isHoveringPoint || state.transitionIntentType === 'move-shape') {
    wrapperClasses.push('move');
  }
  if (isAddingPoint) {
    wrapperClasses.push('crosshair');
  }
  if (isSplitting) {
    wrapperClasses.push('copy');
  }

  return (
    <div className={wrapperClasses.join(' ')} onKeyDown={keyDown} onKeyUp={(e) => helper.key.up(e.key)}>
      <AtlasAuto
        onCreated={(rt) => setRuntime(rt.runtime)}
        mode={currentShape ? 'sketch' : 'explore'}
        renderPreset={preset as any}
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
            {shapes.map((shape, idx) => {
              if (idx === selectedShape) {
                return null;
              }

              const Shape = 'shape' as any;
              return (
                <Shape
                  id={`shape-${idx}`}
                  key={idx}
                  // className="shape"
                  onClick={state.transitioning || currentShape?.open ? undefined : () => changeShape(idx)}
                  points={shape.points}
                  target={{ x: 0, y: 0, width: image.width, height: image.height }}
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
            <HTMLPortal relative={true} interactive={false}>
              <div style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}>
                <svg width="100%" height="100%" viewBox={`0 0 ${image.width} ${image.height}`} tabIndex={-1}>
                  <defs>{defs}</defs>

                  {/*{shapes.map((shape, idx) => {*/}
                  {/*  if (idx === selectedShape) {*/}
                  {/*    return null;*/}
                  {/*  }*/}

                  {/*  const Shape = shape.open ? 'polyline' : 'polygon';*/}
                  {/*  return (*/}
                  {/*    <Shape*/}
                  {/*      key={idx}*/}
                  {/*      className="shape"*/}
                  {/*      onClick={state.transitioning || currentShape?.open ? undefined : () => changeShape(idx)}*/}
                  {/*      points={shape.points.map((r) => r.join(',')).join(' ')}*/}
                  {/*      vectorEffect="non-scaling-stroke"*/}
                  {/*      style={{ pointerEvents: state.transitioning || currentShape?.open ? 'none' : 'visible' }}*/}
                  {/*    />*/}
                  {/*  );*/}
                  {/*})}*/}

                  {editor}
                </svg>
              </div>
            </HTMLPortal>
          </world-object>
        </world>
      </AtlasAuto>
      <button onClick={addShape}>Add shape</button>
      <div>Transition intent: {helper.label(state.transitionIntentType)}</div>
      <div>Action intent: {helper.label(state.actionIntentType)}</div>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <pre>{JSON.stringify(helper.modifiers.getForType(state.transitionIntentType), null, 2)}</pre>
      <pre>{JSON.stringify(helper.modifiers.getForType(state.actionIntentType), null, 2)}</pre>
      <pre>{JSON.stringify({ currentShape }, null, 2)}</pre>
    </div>
  );
}
