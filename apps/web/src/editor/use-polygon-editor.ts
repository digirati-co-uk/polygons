import { useEffect, useRef, useState } from 'react';
import { createHelper, type CreateHelperInput, type InputShape, type RenderState, type SlowState } from 'polygons-core';

export interface EditorOptions extends CreateHelperInput {
  shape: InputShape;
  onChange?: (shape: InputShape) => void;
}

/** Hosts feed canvas-local world coordinates. A flush renders once, without an RAF loop. */
export function usePolygonEditor({ shape, onChange, ...options }: EditorOptions) {
  const change = useRef(onChange);
  change.current = onChange;
  const instance = useRef<ReturnType<typeof createHelper> | null>(null);
  if (!instance.current) instance.current = createHelper({ ...options, ...shape }, (value) => change.current?.(value));
  const helper = instance.current;
  const [renderState, setRenderState] = useState<RenderState>({ ...helper.state });
  const [slowState, setSlowState] = useState<SlowState>(helper.state.slowState);
  const previousShape = useRef(shape);
  const flush = () => helper.clock.flush();
  useEffect(() => {
    if (options.tool === 'pen' && helper.state.isOpen && helper.state.polygon.points.length) helper.tools.smartSelect();
    helper.clock.set((state) => {
      setRenderState({ ...state, polygon: { ...state.polygon }, selectedPoints: [...state.selectedPoints] });
      setSlowState(state.slowState);
    });
    flush();
    return () => {
      helper.cancelGesture('unmount');
      helper.clock.stop();
      helper.clock.set(() => {});
    };
  }, [helper]);
  useEffect(() => {
    if (shape !== previousShape.current) {
      const current = {
        id: helper.state.slowState.shapeId || undefined,
        open: helper.state.isOpen,
        points: helper.state.polygon.points,
      };
      if (JSON.stringify(current) !== JSON.stringify(shape)) {
        helper.setShape(shape);
        if (options.tool === 'pen' && shape.open && shape.points.length) helper.tools.smartSelect();
      }
      previousShape.current = shape;
      flush();
    }
  }, [shape, helper]);
  useEffect(() => {
    helper.setPointerType(options.pointerType || 'mouse');
    flush();
  }, [options.pointerType, helper]);
  useEffect(() => {
    helper.setBoxPlacement(options.boxPlacement || 'drag');
    flush();
  }, [options.boxPlacement, helper]);
  useEffect(() => {
    helper.setDragOffset(options.dragOffset || [0, 0]);
  }, [options.dragOffset?.[0], options.dragOffset?.[1], helper]);
  return { helper, renderState, slowState, flush };
}
