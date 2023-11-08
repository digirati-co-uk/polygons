'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createHelper, RenderState, SlowState, createSvgHelpers } from 'polygons-core';
import { useHelper } from './_helpers/use-helper';

type ShapeDefinition = {
  points: Array<[number, number]>;
  open: boolean;
};

// const initialData = {
//   points: [
//     [120, 120],
//     [140, 160],
//     [210, 270],
//     [250, 160],
//     [250, 120],
//   ],
//   open: true,
// };

const svgHelpers = createSvgHelpers();

export type ShapeState = {
  shapes: Array<ShapeDefinition>;
  selectedShape: number | null;
};

export type ShapeActions =
  | { type: 'add-shape' }
  | { type: 'update-current-shape'; shape: ShapeDefinition }
  | { type: 'remove-shape' }
  | { type: 'select-shape'; idx: number }
  | { type: 'deselect-shape' };

export function shapeReducer(state: ShapeState, action: ShapeActions): ShapeState {
  switch (action.type) {
    case 'add-shape':
      return {
        ...state,
        shapes: [
          ...state.shapes,
          {
            points: [],
            open: true,
          },
        ],
        selectedShape: state.shapes.length,
      };
    case 'update-current-shape':
      return {
        ...state,
        shapes: state.shapes.map((shape, idx) => {
          if (idx === state.selectedShape) {
            return action.shape;
          }
          return shape;
        }),
      };
    case 'remove-shape':
      return {
        ...state,
        shapes: state.shapes.filter((_, idx) => idx !== state.selectedShape),
        selectedShape: null,
      };
    case 'select-shape':
      return {
        ...state,
        selectedShape: action.idx,
      };
    case 'deselect-shape':
      return {
        ...state,
        selectedShape: null,
      };
  }
}

export default function Page(): JSX.Element {
  const [{ selectedShape, shapes }, dispatch] = useReducer(shapeReducer, {
    shapes: [
      {
        points: [
          [120, 120],
          [140, 160],
          [210, 270],
          [250, 160],
          [250, 120],
        ],
        open: true,
      },
    ],
    selectedShape: 0,
  });

  const currentShape = selectedShape !== null ? shapes[selectedShape] : null;
  const boundingBox = useRef<any>();
  const transitionBoundingBox = useRef<any>();
  const selectBox = useRef<any>();
  const hint = useRef<any>();
  const transitionShape = useRef<any>();
  const pointLine = useRef<any>();
  const { helper, state } = useHelper(
    currentShape,
    (state: RenderState, slowState: SlowState) => {
      svgHelpers.updateTransitionBoundingBox(transitionBoundingBox.current, state, slowState);
      svgHelpers.updateBoundingBox(boundingBox.current, state, slowState);
      svgHelpers.updateTransitionShape(transitionShape.current, state, slowState);
      svgHelpers.updateClosestLinePoint(hint.current, state, slowState);
      svgHelpers.updateSelectBox(selectBox.current, state, slowState);
      svgHelpers.updatePointLine(pointLine.current, state, slowState);
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
    helper.pointer([[e.clientX, e.clientY]]);
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

  return (
    <div>
      <div>
        <svg
          height={600}
          width={800}
          onPointerMove={mouseMove}
          onBlur={onBlur}
          onMouseDown={helper.pointerDown}
          onMouseUp={helper.pointerUp}
          onMouseLeave={helper.blur}
          onTouchStart={touchStart}
          onTouchEnd={touchEnd}
          onTouchMove={touchMove}
          onKeyDown={(e) => helper.key.down(e.key)}
          onKeyUp={(e) => helper.key.up(e.key)}
          tabIndex={-1}
        >
          {shapes.map((shape, idx) => {
            const Shape = shape.open ? 'polyline' : 'polygon';
            return (
              <Shape
                key={idx}
                onClick={idx === selectedShape ? undefined : () => changeShape(idx)}
                fill="transparent"
                strokeWidth={2}
                stroke={idx === selectedShape ? '#000' : '#999'}
                points={shape.points.map((r) => r.join(',')).join(' ')}
              />
            );
          })}
          {currentShape && Shape ? (
            <>
              {!state.transitioning &&
              (state.actionIntentType === 'add-open-point' || state.actionIntentType === 'close-shape') ? (
                <polyline
                  stroke="#000"
                  ref={pointLine}
                  strokeWidth={state.actionIntentType === 'close-shape' ? 2 : 1}
                />
              ) : null}
              {state.hasClosestLine && (!state.transitionIntentType || state.transitionIntentType === 'split-line') ? (
                <circle ref={hint} cx={0} cy={0} r={5} stroke="#000" />
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
                <rect ref={selectBox} fill="rgba(255, 255, 255, .3)" strokeWidth={1} stroke="rgba(0,0,0,.2)" />
              ) : null}
              {!state.showBoundingBox ? (
                <g name="controls">
                  {currentShape.points.map((point, key) => {
                    const selectedBounds = null;
                    const isActive = (state.selectedPoints || []).includes(key);

                    return (
                      <circle
                        className={`controls ${isActive ? 'controls--selected' : ''}${
                          selectedBounds ? ' controls--bounds' : ''
                        }`}
                        key={key}
                        cx={point[0]}
                        cy={point[1]}
                        r={isActive && selectedBounds ? 3 : 5}
                      />
                    );
                  })}
                </g>
              ) : null}
              {state.showBoundingBox ? <rect ref={boundingBox} strokeWidth={1} stroke="#999" fill="none" /> : null}
            </>
          ) : null}
        </svg>
      </div>
      <button onClick={addShape}>Add shape</button>
      <div>Transition intent: {state.transitionIntentType}</div>
      <pre>{JSON.stringify({ currentShape }, null, 2)}</pre>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
