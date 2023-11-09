import { perimeterNearestTo, Point, precalculate, updateBoundingBox } from './polygon';
import { ActionIntent, RenderFunc, RenderState, SetState, SlowState, TransitionIntent } from './types';
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
import {deletePoint} from './intents/delete-point';

const requestAnimationFrame =
  typeof window !== 'undefined' ? window.requestAnimationFrame : (func: any) => setTimeout(func, 16) as any as number;

const cancelAnimationFrame =
  typeof window !== 'undefined' ? window.cancelAnimationFrame : (id: any) => clearTimeout(id);

interface CreateHelperInput {
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
  //
  boundingBoxCorners,
  movePoint,
  splitLine,
  moveShape,
  translateBoundingBox,
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
  //
  closeShape,
  selectPoint,
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


const intentMap: Record<string, ActionIntent | TransitionIntent>  = {};
transitionIntents.forEach(i => {
  intentMap[i.type] = i;
})
actionIntents.forEach(i => {
  intentMap[i.type] = i;
})
keyIntents.forEach(i => {
  intentMap[i.type] = i;
})

const BASE_PROXIMITY = 20;

export function createHelper(input: CreateHelperInput, onSave: (input: CreateHelperInput) => void) {
  // This is state that will change frequently, and used in the clock-managed render function.
  const state: RenderState = {
    isOpen: input ? input.open : false,
    polygon: {
      points: input?.points || [],
      iedges: null,
      boundingBox: null,
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
    transitionDirection: null,
    selectionBox: null,
  };

  precalculate(state.polygon);
  updateBoundingBox(state.polygon);

  let slowState: SlowState = {
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
  };

  const pointerState = {
    isPressed: false,
    isClicking: false,
    lastPress: null as Point | null,
    pressTimeout: 0,
    noTransition: false,
  };

  // Internal set slow state function.
  function setState(state: Partial<SlowState>) {
    const keys = Object.keys(state);
    if (keys.length === 0) return;
    const readOnlySlowState = internals.nextSlowState || slowState;

    // Optimise validIntentKeys
    if (keys.length === 1 && keys[0] === 'validIntentKeys' && readOnlySlowState.validIntentKeys) {
      const keysA = Object.keys(readOnlySlowState.validIntentKeys);
      const keysB = Object.keys(state.validIntentKeys || {});
      let change = false;
      if (keysA.length === keysB.length) {
        for (const key of keysA) {
          if (readOnlySlowState.validIntentKeys[key] !== (state.validIntentKeys as any)[key]) {
            change = true;
          }
        }
        if (!change) {
          return;
        }
      }
    }

    if (keys.includes('hasClosestLine')) {
      if (state.hasClosestLine === readOnlySlowState.hasClosestLine) {
        return;
      }
    }

    if (internals.nextSlowState) {
      internals.nextSlowState = { ...internals.nextSlowState, ...state };
      return;
    }
    internals.nextSlowState = { ...slowState, ...state };
  }

  // 1. Create the clock
  function clockFunction(delta: number, stop = false) {
    internals.time += delta;

    // This _might_ be slowed down later.
    flushSetState();
    updateBoundingBoxVisibility();
    updateClosestIntersection();
    updateCurrentIntent();
    calculateLine();

    // Then the render function from the user last, once the state is updated.
    internals.renderFunc(state, slowState, delta);

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
        open: state.isOpen,
        points: state.polygon.points,
      });
      internals.shouldUpdate = false;
    }
    // console.log(internals.nextSlowState, slowState);
    if (internals.nextSlowState && internals.nextSlowState !== slowState) {
      const keys = Object.keys(slowState) as Array<keyof SlowState>;
      const nextState: Record<string, any> = {};
      let didChange = false;
      for (const key of keys) {
        const current = slowState[key];
        const next = internals.nextSlowState[key];
        if (current !== next) {
          didChange = true;
          nextState[key] = next;
        } else {
          nextState[key] = current;
        }
      }
      if (didChange) {
        slowState = nextState as SlowState;
        internals.nextSlowState = null;
        internals.setStateFunc(slowState);
      }
    }
  }

  function updateBoundingBoxVisibility() {
    if (slowState.showBoundingBox) {
      if (state.selectedPoints.length === 0 || state.selectedPoints.length !== state.polygon.points.length) {
        setState({ showBoundingBox: false });
      }
    } else {
      if (state.polygon.points.length && state.selectedPoints.length === state.polygon.points.length) {
        setState({ showBoundingBox: true });
      }
    }
  }

  function updateClosestIntersection() {
    if (!state.pointer || slowState.transitioning) return;

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
    if (slowState.transitioning) return;

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
    setState({ validIntentKeys: keyMap  });
  }

  function calculateLine() {
    const pointer = state.pointer;
    if (!pointer || !isDrawing()) return;

    const point = state.selectedPoints[0];
    state.line = [state.polygon.points[point], pointer];
  }

  // Helpers
  // ======================
  // Just some helpers to make the code more readable.
  function getModifiers() {
    return slowState.modifiers;
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
        precalculate(state.polygon);
        updateBoundingBox(state.polygon);
        internals.shouldUpdate = true;
      }
      if (resp.isOpen === true || resp.isOpen === false) {
        state.isOpen = resp.isOpen;
        internals.shouldUpdate = true;
      }
    }
  }

  function validate(intent: ActionIntent | TransitionIntent) {
    return intent.isValid(state.pointer ? [state.pointer] : [], state, getModifiers());
  }

  function triggerKeyAction(key: string) {
    for (const keyIntent of keyIntents) {
      if (keyIntent.trigger.type !== 'key' || keyIntent.trigger.key !== key) continue;
      if (validate(keyIntent)) {
        commit(keyIntent);
        return;
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
    set(modifier: string) {
      if (modifier !== 'Shift' && modifier !== 'Alt' && modifier !== 'Meta') return;
      setState({
        modifiers: { ...(internals.nextSlowState?.modifiers || slowState.modifiers), [modifier]: true },
      });
    },
    unset(modifier: string) {
      if (modifier !== 'Shift' && modifier !== 'Alt' && modifier !== 'Meta') return;
      setState({
        modifiers: { ...(internals.nextSlowState?.modifiers || slowState.modifiers), [modifier]: false },
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
        return;
      }
      triggerKeyAction(key);
    },
    up(key: string) {
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
    setState({ modifiers: { ...(internals.nextSlowState?.modifiers || slowState.modifiers), proximity: scale * BASE_PROXIMITY }, })
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
        setStateFunc(slowState);
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

    if (slowState.transitioning) {
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
            }
          }
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
    if (!slowState.transitioning) {
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
      pointer([pointerState.lastPress!]);
    }, 250) as any as number;
  }

  // Pointer up
  // Attached to the SVG element, used to complete transitions OR actions
  // depending on if a click was detected.
  function pointerUp() {
    if (slowState.transitioning) {
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
  function setShape(shape: { points: Array<[number, number]>; open: boolean }) {
    state.polygon.points = shape.points;
    state.isOpen = shape.open;
    precalculate(state.polygon);
    updateBoundingBox(state.polygon);
    internals.nextSlowState = null;
    internals.shouldUpdate = true;
    // Reset
    setState({
      transitioning: false,
      actionIntentType: null,
      transitionIntentType: null,
      selectedPoints: [],
      hasClosestLine: false,
      modifiers: {
        Alt: false,
        Shift: false,
        Meta: false,
        proximity: BASE_PROXIMITY,
      },
      showBoundingBox: false,
      currentModifiers: {},
      validIntentKeys: {},
    });
  }

  function label(type: string) {
    if (!type) return '';
    const intent = intentMap[type];
    if (!intent || !intent.modifiers) {
      return intent.label || '';
    }

    if (slowState.modifiers.Shift && intent.modifiers.Shift) {
      return intent.modifiers.Shift;
    }
    if (slowState.modifiers.Alt && intent.modifiers.Alt) {
      return intent.modifiers.Alt;
    }
    if (slowState.modifiers.Meta && intent.modifiers.Meta) {
      return intent.modifiers.Meta;
    }

    return intent.label;
  }

  return {
    state,
    modifiers,
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
