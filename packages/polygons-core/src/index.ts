import { perimeterNearestTo, Point, Polygon, precalculate as _precalculate, updateBoundingBox } from './polygon';
import { ActionIntent, InputShape, RenderFunc, RenderState, SetState, SlowState, TransitionIntent } from './types';
import { translateBoundingBox } from './intents/translate-bounding-box';
import { moveShape } from './intents/move-shape';
import { distance } from './math';
import { movePoint } from './intents/move-point';
import { selectPoint } from './intents/select-point';
import { splitLine } from './intents/split-line';
import { addOpenPoint } from './intents/add-open-point';
import { closeShape } from './intents/close-shape';
import { deselectDraw } from './intents/deselect-draw';
import { selectShape } from './intents/select-shape';
import { deselectBoundingBox } from './intents/deselect-bounding-box';
import { boundingBoxCorners } from './intents/bounding-box-corners';
import { cutLine } from './intents/cut-line';
import { selectMultiplePoints } from './intents/select-multiple-points';
import { deselectPoints } from './intents/deselect-points';
import { nudgeDown, nudgeLeft, nudgeRight, nudgeUp } from './intents/nudge';
import { deletePoint } from './intents/delete-point';
import { drawShape } from './intents/draw-shape';
import { stampShape } from './intents/stamp-shape';
import { closeShapeLine } from './intents/close-shape-line';
import { stampFixedSizeShape } from './intents/stamp-fixed-size-shape';

const requestAnimationFrame =
  typeof window !== 'undefined' ? window.requestAnimationFrame : (func: any) => setTimeout(func, 16) as any as number;

const cancelAnimationFrame =
  typeof window !== 'undefined' ? window.cancelAnimationFrame : (id: any) => clearTimeout(id);

interface CreateHelperInput {
  id?: string;
  open: boolean;
  points: Array<Point>;
}

/**
 * Transition intents
 *
 * A transition intent is a "drag" action. It is used to move points, or
 * to create new points. It is also used to create a selection box. During a
 * transition or drag action, the state is not updated until the transition
 * is committed. There is a temporary state, usually prefixed with "transition"
 * that is used to render the UI during the transition.
 *
 * It's called an "intent" because each frame only one will be chosen as
 * the selected intent. So if the used started dragging from where their cursor
 * was, it would be the chosen intent. If they started dragging from a point,
 * it would be the move point intent.
 *
 * This chosen intent can then be used to change the cursor or add helpful
 * UI to the screen.
 */
const transitionIntents = [
  stampShape,
  boundingBoxCorners,
  movePoint,
  splitLine,
  moveShape,
  translateBoundingBox,
  drawShape,
  selectMultiplePoints,
];
const transitionIntentsLength = transitionIntents.length;

/**
 * Action intents
 *
 * An action intent is a "click" action. It is used to perform an action
 * immediately, and will update the state. It is also used to perform actions
 * that are not "drag" actions, such as nudging points. The action intents listed
 * in here are all "pointer click" actions, but there are also "key" actions
 * that are triggered by the key manager (keyIntents below)
 */
const actionIntents = [
  stampFixedSizeShape,
  closeShape,
  selectPoint,
  closeShapeLine,
  cutLine,
  addOpenPoint,
  selectShape,
  deselectBoundingBox,
  deselectPoints,
];

const keyIntents = [
  //
  deselectDraw,
  nudgeRight,
  nudgeLeft,
  nudgeUp,
  nudgeDown,
  deletePoint,
];

type UndoStackItem = {
  isOpen: boolean;
  points: Point[];
  selectedPoints: number[];
};

const intentMap: Record<string, ActionIntent | TransitionIntent> = {};
transitionIntents.forEach((i) => {
  intentMap[i.type] = i;
});
actionIntents.forEach((i) => {
  intentMap[i.type] = i;
});
keyIntents.forEach((i) => {
  intentMap[i.type] = i;
});

const BASE_PROXIMITY = 20;

export function createHelper(input: CreateHelperInput | null, onSave: (input: CreateHelperInput) => void) {
  // This state will not change frequently.
  const slowState: SlowState = {
    shapeId: input?.id || null,
    noShape: input === null,
    transitioning: false,
    actionIntentType: null,
    transitionIntentType: null,
    selectedPoints: [],
    hasClosestLine: false,
    modifiers: {
      Alt: false,
      Shift: false,
      Meta: false,
      proximity: BASE_PROXIMITY, // default value.
    },
    showBoundingBox: false,
    currentModifiers: {},
    validIntentKeys: {},
    pointerInsideShape: false,
    closestPoint: null,
    transitionModifiers: null,
    selectedStamp: null,
    drawMode: false,
    bezierLines: [],
  };

  // This is state that will change frequently, and used in the clock-managed render function.
  const state: RenderState = {
    isOpen: input ? input.open : false,
    polygon: {
      points: input?.points || [],
      iedges: null,
      boundingBox: null,
      isBezier: null,
      bezierLines: [],
    },
    scale: 1,
    selectedPoints: [],
    pointer: null,
    line: null,
    transitionPoints: null,
    transitionOrigin: null,
    transitionBoundingBox: null,
    closestLinePoint: null,
    closestLineDistance: 0,
    closestLineIndex: -1,
    transitionRotate: false,
    transitionDirection: null,
    transitionBezierLine: null,
    selectionBox: null,
    slowState,
    transitionDraw: [],
  };

  // This is state held internally to the helper.
  const internals = {
    startTime: 0,
    time: 0,
    shouldUpdate: false,
    nextSlowState: null as SlowState | null,
    renderFunc: (() => {}) as RenderFunc,
    setStateFunc: (() => {}) as SetState,
    animationFrame: 0,
    actionIntent: null as ActionIntent | null,
    transitionIntent: null as TransitionIntent | null,
    undoStack: [] as Array<UndoStackItem>,
    undoStackPointer: -1,
  };

  const pointerState = {
    isPressed: false,
    isClicking: false,
    lastPress: null as Point | null,
    pressTimeout: 0,
    noTransition: false,
  };

  function precalculate(polygon: Polygon) {
    _precalculate(polygon);
    if (polygon.isBezier) {
      setState({ bezierLines: polygon.bezierLines });
    }
    updateBoundingBox(polygon);
    internals.shouldUpdate = true;
  }

  precalculate(state.polygon);

  // Internal set slow state function.
  function setState(newState: Partial<SlowState>) {
    const keys = Object.keys(newState);
    if (keys.length === 0) return;
    const readOnlySlowState = internals.nextSlowState || state.slowState;

    let change = false;
    // Optimise validIntentKeys
    if (keys.length === 1 && keys[0] === 'validIntentKeys' && readOnlySlowState.validIntentKeys) {
      const keysA = Object.keys(readOnlySlowState.validIntentKeys);
      const keysB = Object.keys(newState.validIntentKeys || {});
      if (keysA.length === keysB.length) {
        for (const key of keysA) {
          if (readOnlySlowState.validIntentKeys[key] !== (newState.validIntentKeys as any)[key]) {
            change = true;
          }
        }
        if (!change) {
          return;
        }
      }
    }

    if (keys.length === 1 && keys.includes('hasClosestLine')) {
      if (newState.hasClosestLine === readOnlySlowState.hasClosestLine) {
        return;
      }
    }

    if (internals.nextSlowState) {
      internals.nextSlowState = { ...internals.nextSlowState, ...newState };
      return;
    }
    internals.nextSlowState = { ...state.slowState, ...newState };
  }

  // 1. Create the clock
  function clockFunction(delta: number, stop = false) {
    internals.time += delta;

    // This _might_ be slowed down later.
    flushSetState();
    updateBoundingBoxVisibility();
    updateClosestIntersection();
    updateClosestPoint();
    updateShapeIntersection();
    updateCurrentIntent();
    calculateLine();

    // Then the render function from the user last, once the state is updated.
    internals.renderFunc(state, state.slowState, delta);

    if (stop) return;
    internals.animationFrame = requestAnimationFrame(clockFunction);
  }

  // Clock update functions
  // ======================
  // These are called on each frame. They may run at different "frame rates"
  // in the future if there are performance issues.
  // They should be listed here in the order they are called, so this section
  // can be read as the "clock".
  function flushSetState() {
    if (internals.shouldUpdate) {
      onSave({
        id: state.slowState.shapeId || undefined,
        open: state.isOpen,
        points: state.polygon.points,
      });
      internals.shouldUpdate = false;
    }
    // console.log(internals.nextSlowState, state.slowState);
    if (internals.nextSlowState && internals.nextSlowState !== state.slowState) {
      const keys = Object.keys(state.slowState) as Array<keyof SlowState>;
      const nextState: Record<string, any> = {};
      let didChange = false;
      for (const key of keys) {
        const current = state.slowState[key];
        const next = internals.nextSlowState[key];
        if (current !== next) {
          didChange = true;
          nextState[key] = next;
        } else {
          nextState[key] = current;
        }
      }
      if (didChange) {
        state.slowState = nextState as SlowState;
        internals.nextSlowState = null;
        internals.setStateFunc(state.slowState);
      }
    }
  }

  function updateBoundingBoxVisibility() {
    if (state.slowState.showBoundingBox) {
      if (
        state.slowState.noShape ||
        state.selectedPoints.length === 0 ||
        state.selectedPoints.length !== state.polygon.points.length
      ) {
        setState({ showBoundingBox: false });
      }
    } else {
      if (
        !state.slowState.noShape &&
        state.polygon.points.length &&
        state.selectedPoints.length === state.polygon.points.length
      ) {
        setState({ showBoundingBox: true });
      }
    }
  }

  function applyUndo(resp: { points: Point[]; selectedPoints: number[]; isOpen: boolean }) {
    state.selectedPoints = resp.selectedPoints;
    setState({ selectedPoints: resp.selectedPoints });

    state.polygon.points = resp.points;
    state.polygon.boundingBox = null;
    state.polygon.iedges = null;
    state.polygon.isBezier = null;
    precalculate(state.polygon);
    setState({ closestPoint: null });

    if (resp.isOpen === true || resp.isOpen === false) {
      state.isOpen = resp.isOpen;
      internals.shouldUpdate = true;
    }
  }

  function undo() {
    if (internals.undoStackPointer === -1) return;
    internals.undoStackPointer--;
    const resp = internals.undoStack[internals.undoStackPointer];

    applyUndo(resp);
  }

  function redo() {
    if (internals.undoStackPointer === internals.undoStack.length - 1) return;
    internals.undoStackPointer++;
    const resp = internals.undoStack[internals.undoStackPointer];

    applyUndo(resp);
  }

  function pushUndo(resp: UndoStackItem) {
    internals.undoStackPointer++;
    internals.undoStack[internals.undoStackPointer] = resp;

    if (internals.undoStack.length > 15) {
      internals.undoStack.shift();
      internals.undoStackPointer--;
    }
  }

  function updateShapeIntersection() {
    if (!state.pointer || state.slowState.noShape) {
      setState({ pointerInsideShape: false });
      return;
    }
    // Does the point intersect with the shape?
    const [x, y] = state.pointer;
    const points = state.polygon.points;
    const box = state.polygon.boundingBox;

    // @todo only enable when all points are NOT selected.

    if (!box) {
      setState({ pointerInsideShape: false });
      return;
    }

    // Outside the bounding box.
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.height + box.y) {
      setState({ pointerInsideShape: false });
      return;
    }

    // Outside the polygon.
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (
        points[i][1] > y != points[j][1] > y &&
        x < ((points[j][0] - points[i][0]) * (y - points[i][1])) / (points[j][1] - points[i][1]) + points[i][0]
      ) {
        inside = !inside;
      }
    }

    setState({ pointerInsideShape: inside });
  }

  function updateClosestPoint() {
    if (
      state.slowState.noShape ||
      !state.pointer ||
      state.slowState.transitioning ||
      !state.polygon.points ||
      state.polygon.points.length === 0
    )
      return;

    const [x, y] = state.pointer;
    const pointDistances = state.polygon.points
      .map((point, idx) => {
        const dx = point[0] - x;
        const dy = point[1] - y;
        return [dx * dx + dy * dy, idx];
      })
      .sort((a, b) => a[0] - b[0]);

    if (pointDistances.length) {
      setState({ closestPoint: pointDistances[0][1] });
    }
  }

  function updateClosestIntersection() {
    if (!state.pointer || state.slowState.transitioning) return;

    if (state.slowState.noShape) {
      state.closestLineIndex = -1;
      state.closestLinePoint = null;
      state.closestLineDistance = 0;
      return;
    }

    const [intersection, distance, line, prevIdx] = perimeterNearestTo(state.polygon, state.pointer);

    // Distance is squared.

    const proximityDistance = getProximity() * getProximity();

    if (distance < proximityDistance && (!state.isOpen || state.polygon.points.length - 1 !== prevIdx)) {
      state.closestLinePoint = intersection;
      state.closestLineDistance = Math.sqrt(distance);
      state.closestLineIndex = prevIdx;
      setState({ hasClosestLine: true });
    } else {
      state.closestLinePoint = null;
      state.closestLineDistance = 0;
      state.closestLineIndex = -1;
      setState({ hasClosestLine: false });
    }
  }

  function updateCurrentIntent() {
    if (!state.pointer) return;
    if (state.slowState.transitioning) return;
    if (state.slowState.noShape) return;

    // Do some calculations for the intents to use, and also to update the pending UI.
    let didSetTransition = false;
    // We are not yet transitioning, and need to feed back to the user.
    for (let i = 0; i < transitionIntentsLength; i++) {
      const intent = transitionIntents[i];
      const isValid = intent.isValid(
        pointerState.isPressed ? [pointerState.lastPress!] : [state.pointer],
        state,
        getModifiers()
      );
      if (isValid) {
        if (internals.transitionIntent === intent) {
          didSetTransition = true;
          break;
        }
        setState({ transitionIntentType: intent.type });
        internals.transitionIntent = intent;
        didSetTransition = true;
        break;
      }
    }
    if (!didSetTransition) {
      if (internals.transitionIntent) {
        internals.transitionIntent = null;
        setState({ transitionIntentType: null });
      }
    }

    let didSetAction = false;
    for (let i = 0; i < actionIntents.length; i++) {
      const intent = actionIntents[i];
      if (validate(intent)) {
        if (internals.actionIntent === intent) {
          didSetAction = true;
          break;
        }
        setState({ actionIntentType: intent.type });
        internals.actionIntent = intent;
        didSetAction = true;
        break;
      }
    }
    if (!didSetAction) {
      if (internals.actionIntent) {
        internals.actionIntent = null;
        setState({ actionIntentType: null });
      }
    }

    const keyMap: Record<string, string> = {};
    for (let i = 0; i < keyIntents.length; i++) {
      const intent = keyIntents[i];
      if (intent.trigger.type === 'key' && validate(intent)) {
        keyMap[intent.trigger.key] = intent.label;
      }
    }
    setState({ validIntentKeys: keyMap });
  }

  function calculateLine() {
    const pointer = state.pointer;
    if (!pointer || !isDrawing() || state.slowState.noShape) return;

    const point = state.selectedPoints[0];
    state.line = [state.polygon.points[point], pointer];

    if (state.slowState.modifiers.Shift) {
      // Previous point will be used to give an angle offset to snap to.
      let prevAngle = 0;
      if (state.polygon.points.length > 1) {
        const point = state.selectedPoints[0];
        if (point === 0) {
          prevAngle = Math.atan2(
            state.polygon.points[1][1] - state.polygon.points[0][1],
            state.polygon.points[1][0] - state.polygon.points[0][0]
          );
        } else {
          prevAngle = Math.atan2(
            state.polygon.points[point - 1][1] - state.polygon.points[point][1],
            state.polygon.points[point - 1][0] - state.polygon.points[point][0]
          );
        }
      }

      // Need to snap to 45deg RELATIVE to the previous angle.
      const dx = pointer[0] - state.polygon.points[point][0];
      const dy = pointer[1] - state.polygon.points[point][1];
      const angle = Math.atan2(dy, dx);

      // Snap to 45deg relative to the previous angle.
      const snap = Math.PI / 4;
      const snapAngle = Math.round((angle - prevAngle) / snap) * snap + prevAngle;
      const dist = distance(state.polygon.points[point], pointer);
      const x = Math.cos(snapAngle) * dist + state.polygon.points[point][0];
      const y = Math.sin(snapAngle) * dist + state.polygon.points[point][1];
      state.line[1] = [x, y];

      // What's the angle?
      // const dx = pointer[0] - state.polygon.points[point][0];
      // const dy = pointer[1] - state.polygon.points[point][1];
      // const angle = Math.atan2(dy, dx);
      // // Snap to 45deg
      // const snap = Math.PI / 4;
      // const snapAngle = Math.round(angle / snap) * snap;
      // const dist = distance(state.polygon.points[point], pointer);
      // const x = Math.cos(snapAngle) * dist + state.polygon.points[point][0];
      // const y = Math.sin(snapAngle) * dist + state.polygon.points[point][1];
      // state.line[1] = [x, y];
    }
  }

  // Helpers
  // ======================
  // Just some helpers to make the code more readable.
  function getModifiers() {
    return state.slowState.modifiers;
  }

  function commit(intent: ActionIntent | TransitionIntent) {
    const resp = intent.commit([pointerState.lastPress!], state, getModifiers());
    if (resp) {
      if (resp.selectedPoints) {
        state.selectedPoints = resp.selectedPoints;
        setState({ selectedPoints: resp.selectedPoints });
      }
      if (resp.points) {
        state.polygon.points = resp.points;
        state.polygon.boundingBox = null;
        state.polygon.iedges = null;
        state.polygon.isBezier = null;
        state.transitionBoundingBox = null;
        precalculate(state.polygon);
        setState({ closestPoint: null, selectedStamp: null });
      }
      if (resp.isOpen === true || resp.isOpen === false) {
        state.isOpen = resp.isOpen;
        internals.shouldUpdate = true;
      }
      pushUndo({
        isOpen: state.isOpen,
        points: state.polygon.points,
        selectedPoints: state.selectedPoints,
      });
    }
    setState({ transitionModifiers: null });
  }

  function validate(intent: ActionIntent | TransitionIntent) {
    return intent.isValid(state.pointer ? [state.pointer] : [], state, getModifiers());
  }

  function triggerKeyAction(key: string) {
    if (key === 'Delete') {
      key = 'Backspace';
    }
    for (const keyIntent of keyIntents) {
      if (keyIntent.trigger.type !== 'key' || keyIntent.trigger.key !== key) continue;
      if (validate(keyIntent)) {
        commit(keyIntent);
        return true;
      }
    }
  }

  function isDrawing() {
    const points = state.polygon.points;
    const pointer = state.pointer;
    if (!state.isOpen || !points.length || state.selectedPoints.length !== 1 || !pointer) {
      return false;
    }
    const point = state.selectedPoints[0];
    // Did we select the first or last
    const first = point === 0;
    const last = point === points.length - 1;
    return first || last;
  }

  // Public API
  // ======================
  // Modifier API
  // This allows you to set modifiers, which are used by the intents. You can
  // also use the Key manager to set these.
  const modifiers = {
    reset() {
      setState({ modifiers: { Alt: false, Shift: false, Meta: false, proximity: BASE_PROXIMITY } });
    },
    getForType(type: string | null) {
      const modifiers: Record<string, string> = {};
      if (!type) return modifiers;
      const intent = intentMap[type];
      if (!intent || !intent.modifiers) {
        return modifiers;
      }

      return intent.modifiers;
    },
    set(modifier: string) {
      if (modifier !== 'Shift' && modifier !== 'Alt' && modifier !== 'Meta') return;
      setState({
        modifiers: { ...(internals.nextSlowState?.modifiers || state.slowState.modifiers), [modifier]: true },
      });
    },
    unset(modifier: string) {
      if (modifier !== 'Shift' && modifier !== 'Alt' && modifier !== 'Meta') return;
      setState({
        modifiers: { ...(internals.nextSlowState?.modifiers || state.slowState.modifiers), [modifier]: false },
      });
    },
  };

  const stamps = {
    set(selectedStamp: InputShape | null) {
      setState({ selectedStamp });
    },
    clear() {
      setState({ selectedStamp: null });
    },
    square() {
      setState({
        selectedStamp: {
          id: 'square',
          open: false,
          points: [
            [0, 0],
            [0, 100],
            [100, 100],
            [100, 0],
          ],
        },
      });
    },
    triangle() {
      setState({
        selectedStamp: {
          id: 'triangle',
          open: false,
          // Equilateral triangle (pyramid)
          points: [
            [50, 0],
            [0, 100],
            [100, 100],
          ],
        },
      });
    },
    pentagon() {
      setState({
        selectedStamp: {
          id: 'pentagon',
          open: false,
          points: [
            [0, 0],
            [0, 100],
            [100, 100],
            [100, 0],
            [50, -50],
          ],
        },
      });
    },
    hexagon() {
      setState({
        selectedStamp: {
          id: 'hexagon',
          open: false,
          // Equilateral hexagon
          points: [
            [0, 0],
            [0, 100],
            [50, 150],
            [100, 100],
            [100, 0],
            [50, -50],
          ],
        },
      });
    },
  };

  // Key manager
  // This will trigger key-based actions. It should be hooked up to
  // the container for the SVG element.
  const key = {
    down(key: string) {
      if (key == 'Shift' || key == 'Alt' || key == 'Meta') {
        modifiers.set(key);
        return true;
      }
      if (key === 'Control') {
        modifiers.set('Meta');
        return true;
      }
      if (key === 'z' && state.slowState.modifiers.Meta) {
        if (state.slowState.modifiers.Shift) {
          redo();
        } else {
          undo();
        }
        return true;
      }
      return triggerKeyAction(key);
    },
    up(key: string) {
      if (key === 'Control') {
        modifiers.unset('Meta');
        return;
      }
      if (key !== 'Shift' && key !== 'Alt' && key !== 'Meta') return;
      modifiers.unset(key);
    },
  };

  // Set scale
  // This allows you to change the proximity calculations. The rest of the
  // state uses "world" coordinates, so this is the only thing that needs
  // to be taken into consideration as the world may be scaled.
  function setScale(scale: number) {
    state.scale = scale;
    setState({
      modifiers: {
        ...(internals.nextSlowState?.modifiers || state.slowState.modifiers),
        proximity: scale * BASE_PROXIMITY,
      },
    });
  }

  function getProximity() {
    return BASE_PROXIMITY * state.scale;
  }

  // Clock
  // Gives granular control over the clock, and allows you to hook into it.
  // Also allows you to test the functionality or debug by stepping
  const clock = {
    set: (renderFunc: RenderFunc) => {
      internals.renderFunc = renderFunc;
    },
    start: (renderFunc?: RenderFunc, setStateFunc?: SetState) => {
      internals.startTime = performance.now();
      internals.time = 0;
      if (renderFunc) {
        internals.renderFunc = renderFunc;
      }
      if (setStateFunc) {
        setStateFunc(state.slowState);
        internals.setStateFunc = setStateFunc;
      }
      // First tick.
      clockFunction(0);
    },
    stop: () => {
      if (internals.animationFrame) {
        cancelAnimationFrame(internals.animationFrame);
        internals.animationFrame = 0;
      }
    },
    step: (deltaTime = 16) => {
      clockFunction(deltaTime);
    },
  };

  // Pointer
  // This is the hottest path, and will be called on every pointer event.
  // It will ensure that transitions are started, and that the state is
  // kept in sync for the clock.
  function pointer(pointers: Point[]) {
    // @todo come back later to support multiple pointers (multi-touch)
    const pointerA = pointers[0];

    if (!pointerA || (!pointerA[0] && pointerA[0] !== 0) || (!pointerA[1] && pointerA[1] !== 0)) {
      return;
    }

    if (Number.isNaN(pointerA[0]) || Number.isNaN(pointerA[1])) {
      return;
    }

    state.pointer = pointerA || null;

    if (state.slowState.transitioning) {
      // We are transitioning, we should update the transition.
      if (internals.transitionIntent) {
        internals.transitionIntent.transition(pointers, state, getModifiers());
      }
    } else if (pointerState.isPressed && !pointerState.noTransition) {
      // We are not transitioning, but should we start?
      const shouldStart = !pointerState.isClicking || distance(pointerState.lastPress!, state.pointer) > 10;
      if (shouldStart) {
        // We are dragging, we should start transitioning.
        clearTimeout(pointerState.pressTimeout);
        pointerState.isClicking = false;

        if (internals.transitionIntent) {
          state.transitionOrigin = pointerState.lastPress!;
          // internals.transitionIntent.transition(pointers, state, {});
          setState({ transitioning: true });
          if (internals.transitionIntent.start) {
            const resp = internals.transitionIntent.start([pointerState.lastPress!], state, getModifiers());
            if (resp) {
              if (resp.selectedPoints) {
                state.selectedPoints = resp.selectedPoints;
                setState({ selectedPoints: resp.selectedPoints });
              }
              if (resp.isOpen === true || resp.isOpen === false) {
                state.isOpen = resp.isOpen;
                internals.shouldUpdate = true;
              }
              if (resp.points) {
                state.polygon.points = resp.points;
                state.polygon.boundingBox = null;
                state.polygon.iedges = null;
                precalculate(state.polygon);
                setState({ closestPoint: null });
              }
            }
          }
          setState({ transitionModifiers: internals.transitionIntent.modifiers || null });
          internals.transitionIntent.transition([pointerState.lastPress!], state, getModifiers());
        } else {
          pointerState.noTransition = true;
        }
      }
    }
  }

  // Blur
  // This can be attached to the container for the SVG element to clear any
  // pending pressing/clicking or transition intents. This can avoid "sticky"
  // cursors when you move your mouse out of the SVG element.
  // It can be attached to both the "blur" and "mouseleave" events.
  function blur() {
    state.pointer = null;
    if (!state.slowState.transitioning) {
      pointerState.isPressed = false;
      pointerState.isClicking = false;
      pointerState.lastPress = null;
      setState({ transitionIntentType: null, actionIntentType: null });
      internals.transitionIntent = null;
      internals.actionIntent = null;
    }
  }

  // Pointer down
  // Attached to the SVG element. This will set up code for `pointerUp` to
  // determine if a click or a drag is happening.
  function pointerDown() {
    pointerState.isClicking = true;
    pointerState.isPressed = true;
    pointerState.lastPress = state.pointer;

    // After 250ms it's no longer a click
    pointerState.pressTimeout = setTimeout(() => {
      if (pointerState.isPressed) {
        pointerState.isClicking = false;
      }
      // pointer([pointerState.lastPress!]);
    }, 250) as any as number;
  }

  // Pointer up
  // Attached to the SVG element, used to complete transitions OR actions
  // depending on if a click was detected.
  function pointerUp() {
    if (state.slowState.transitioning) {
      setState({ transitioning: false });
      if (internals.transitionIntent) {
        commit(internals.transitionIntent);
      }
      internals.transitionIntent = null;
      setState({ transitionIntentType: null });
    } else if (pointerState.isClicking) {
      if (internals.actionIntent) {
        commit(internals.actionIntent);
      }
      internals.actionIntent = null;
      setState({ actionIntentType: null });
    }

    pointerState.isPressed = false;
    pointerState.isClicking = false;
    pointerState.lastPress = null;
    pointerState.noTransition = false;
    clearTimeout(pointerState.pressTimeout);
  }

  // setShape
  function setShape(shape: InputShape | null) {
    state.polygon.points = shape?.points || [];
    state.polygon.boundingBox = null;
    state.polygon.iedges = null;
    state.isOpen = shape?.open || false;
    precalculate(state.polygon);
    internals.nextSlowState = null;
    internals.undoStack = [];
    internals.undoStackPointer = -1;
    if (pointerState.pressTimeout) {
      clearTimeout(pointerState.pressTimeout);
    }
    // Reset
    setState({
      noShape: shape === null,
      shapeId: shape?.id || null,
      transitioning: false,
      actionIntentType: null,
      transitionIntentType: null,
      selectedPoints: [],
      hasClosestLine: false,
      modifiers: {
        Alt: false,
        Shift: false,
        Meta: false,
        proximity: state.slowState.modifiers.proximity,
      },
      showBoundingBox: false,
      currentModifiers: {},
      validIntentKeys: {},
      selectedStamp: null,
      drawMode: false,
      closestPoint: null,
      pointerInsideShape: false,
    });
    flushSetState();
  }

  function label(type: string | null) {
    if (!type) return '';
    const intent = intentMap[type];
    if (!intent || !intent.modifiers) {
      return intent.label || '';
    }

    if (state.slowState.modifiers.Shift && intent.modifiers.Shift) {
      return intent.modifiers.Shift;
    }
    if (state.slowState.modifiers.Alt && intent.modifiers.Alt) {
      return intent.modifiers.Alt;
    }
    if (state.slowState.modifiers.Meta && intent.modifiers.Meta) {
      return intent.modifiers.Meta;
    }

    return intent.label;
  }

  const draw = {
    enable() {
      setState({ drawMode: true });
    },
    disable() {
      setState({ drawMode: false });
    },
    toggle() {
      setState({ drawMode: !state.slowState.drawMode });
    },
  };

  return {
    draw,
    state,
    modifiers,
    stamps,
    key,
    setScale,
    clock,
    pointer,
    blur,
    pointerDown,
    pointerUp,
    setShape,
    label,
  };
}

export * from './types';
export * from './svg-helpers';
