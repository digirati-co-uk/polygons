import { addOpenPoint } from './intents/add-open-point';
import { boundingBoxCorners } from './intents/bounding-box-corners';
import { closeLineBox } from './intents/close-line-box';
import { closeShape } from './intents/close-shape';
import { closeShapeLine } from './intents/close-shape-line';
import { cutLine } from './intents/cut-line';
import { deletePoint } from './intents/delete-point';
import { deselectBoundingBox } from './intents/deselect-bounding-box';
import { deselectDraw } from './intents/deselect-draw';
import { deselectPoints } from './intents/deselect-points';
import { drawShape } from './intents/draw-shape';
import { moveLine } from './intents/move-line';
import { movePoint } from './intents/move-point';
import { moveShape } from './intents/move-shape';
import { nudgeDown, nudgeLeft, nudgeRight, nudgeUp } from './intents/nudge';
import { selectMultiplePoints } from './intents/select-multiple-points';
import { selectPoint } from './intents/select-point';
import { selectShape } from './intents/select-shape';
import { snap } from './intents/snap';
import { splitLine } from './intents/split-line';
import { stampFixedSizeShape } from './intents/stamp-fixed-size-shape';
import { stampShape } from './intents/stamp-shape';
import { toggleSnap } from './intents/toggle-snap';
import { translateBoundingBox } from './intents/translate-bounding-box';
import { distance, isRectangle } from './math';
import {
  precalculate as _precalculate,
  type Point,
  type Polygon,
  perimeterNearestTo,
  updateBoundingBox,
} from './polygon';
import * as shapes from './shapes';
import { applySnapToPointer, clearSnapState, updateSnapState } from './snap-utils';
import type {
  ActionIntent,
  InputShape,
  RenderFunc,
  RenderState,
  SetState,
  SlowState,
  TransitionIntent,
  ValidTools,
} from './types';

const requestAnimationFrame =
  typeof window !== 'undefined' ? window.requestAnimationFrame : (func: any) => setTimeout(func, 16) as any as number;

const cancelAnimationFrame =
  typeof window !== 'undefined' ? window.cancelAnimationFrame : (id: any) => clearTimeout(id);

interface CreateHelperInput {
  id?: string;
  open: boolean;
  points: Array<Point>;
  tool?: ValidTools;
  fixedAspectRatio?: boolean;
  keyboardShortcutMapping?: Record<string, string>;
  toolMap?: Record<string, ValidTools>;
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
  boundingBoxCorners,
  movePoint,
  moveLine,
  splitLine,
  moveShape,
  translateBoundingBox,
  drawShape,
  selectMultiplePoints,
  stampShape,
  snap,
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
  closeLineBox,
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
  toggleSnap,
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

const BASE_PROXIMITY = 10;

export function createHelper(input: CreateHelperInput | null, onSave: (input: CreateHelperInput) => void) {
  const fixedAspectRatio = input?.fixedAspectRatio || false;
  const initialTool = input?.tool || 'pointer';
  const keyboardShortcutMapping = input?.keyboardShortcutMapping || {};
  // Map keys to tools
  const toolMap: Record<string, ValidTools> = {
    V: 'pointer',
    P: 'pen',
    B: 'box',
    L: 'lineBox',
    S: 'stamp',
    H: 'hand',
    N: 'line',
    D: 'pencil',
    ...(input?.toolMap || {}),
  };

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
    selectedStamp: null,
    transitionModifiers: null,
    boxMode: false,
    bezierLines: [],
    fixedAspectRatio,
    cursor: 'default',
    // Initialize tools with defaults based on initialTool
    tools: {
      hand: false,
      pointer: false,
      lineBox: false,
      stamp: false,
      box: false,
      pen: false,
      pencil: false,
      line: false,
    },
    // Set the current tool
    currentTool: initialTool,
    // Snapping configuration
    snapEnabled: false,
    snapToPoints: true,
    snapToLines: true,
    snapToIntersections: true,
    snapToGrid: false,
    snapToParallel: true,
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
    lineBox: null,
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
    panOffset: { x: 0, y: 0 },
    isPanning: false,
    panStart: null,
    snapTargets: [],
    activeSnapGuides: [],
    snapThreshold: 15,
    isSnapping: false,
    snapPoint: null,
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
    calculateLineBox();
    updateIsRectangle();

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
    const shouldShow =
      !state.slowState.noShape &&
      state.polygon.points.length > 2 &&
      state.selectedPoints.length === state.polygon.points.length &&
      !state.isOpen &&
      (state.slowState.currentTool === 'pointer' || state.slowState.currentTool === 'box');

    if (state.slowState.showBoundingBox !== shouldShow) {
      setState({ showBoundingBox: shouldShow });
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

  function updateIsRectangle() {
    setState({ boxMode: isRectangle(state.polygon.points || []) });
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
        points[i][1] > y !== points[j][1] > y &&
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

    if (
      distance < proximityDistance &&
      (!state.isOpen || state.slowState.currentTool === 'line' || state.polygon.points.length - 1 !== prevIdx)
    ) {
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

  /**
   * Get all intents that are valid for a specific tool
   * This is useful for UI hints and filtering available actions
   */
  function getValidIntentsForTool(tool: ValidTools, point: Point | null = null): Record<string, string> {
    const validIntents: Record<string, string> = {};
    const testPoint = point || (state.pointer ? [state.pointer[0], state.pointer[1]] : null);

    // Combine all intent types
    for (const intent of [...transitionIntents, ...actionIntents, ...keyIntents]) {
      // Only include intents that work with this tool
      if (intent.tools.includes(tool)) {
        // If we have a test point, check validity
        if (testPoint && intent.isValid([testPoint], state, getModifiers())) {
          validIntents[intent.type] = intent.label;
        } else if (!testPoint) {
          // Without a test point, just include all intents for this tool
          validIntents[intent.type] = intent.label;
        }
      }
    }

    return validIntents;
  }

  function updateCurrentIntent() {
    // Don't update intents if we're transitioning or have no shape
    if (state.slowState.transitioning) return;
    if (state.slowState.noShape) return;

    // Make sure we have a valid pointer
    if (
      !state.pointer ||
      !Array.isArray(state.pointer) ||
      state.pointer.length < 2 ||
      typeof state.pointer[0] !== 'number' ||
      typeof state.pointer[1] !== 'number'
    ) {
      return;
    }

    // Get the current active tool
    const currentTool = state.slowState.currentTool;

    // Update valid intent keys to help UI display available actions
    const validIntentKeys = getValidIntentsForTool(currentTool, state.pointer);

    // Update UI visibility based on current tool
    updateToolVisibility(currentTool);

    setState({ validIntentKeys });

    // Do some calculations for the intents to use, and also to update the pending UI.
    let didSetTransition = false;
    // We are not yet transitioning, and need to feed back to the user.
    for (let i = 0; i < transitionIntentsLength; i++) {
      const intent = transitionIntents[i];
      // Skip intents that don't apply to the current tool
      if (!intent.tools.includes(currentTool)) continue;

      const isValid = intent.isValid(
        pointerState.isPressed ? [pointerState.lastPress!] : [state.pointer],
        state,
        getModifiers(),
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
      // Skip intents that don't apply to the current tool
      if (!intent.tools.includes(currentTool)) continue;

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

  function calculateLineBox() {
    // This is a box that is extended from 2 points.
    const pointer = state.pointer;
    state.lineBox = null;
    if (!pointer || isDrawing()) return;
    if (state.polygon.points.length !== 2) return;

    // Now we have the line, we need to extend it to a box.
    // lineBox = [Point, Point, Point, Point]
    const [x, y] = pointer;
    const [x1, y1] = state.polygon.points[0];
    const [x2, y2] = state.polygon.points[1];

    // Line is the line from the closest line (there is only one) to the pointer.
    const [intersection, distance, line, prevIdx] = perimeterNearestTo(state.polygon, pointer);
    if (!intersection) return;

    // How far along the intersection is the pointer?
    const dx = x - intersection[0];
    const dy = y - intersection[1];

    // New rectangle is A, B, C, D
    const a = [x1, y1] as Point;
    const b = [x2, y2] as Point;

    // C is tangential to A
    const c = [b[0] + dx, b[1] + dy] as Point;
    const d = [a[0] + dx, a[1] + dy] as Point;

    state.lineBox = [a, b, c, d];
  }

  function calculateLine() {
    const pointer = state.pointer;
    if (!pointer || !isDrawing() || state.slowState.noShape) return;

    const point = state.selectedPoints[0];
    let snappedPointer = pointer;

    if (state.slowState.snapEnabled && !state.slowState.modifiers.Shift) {
      updateSnapState(pointer, state, 5);
      snappedPointer = applySnapToPointer(pointer, state);
    } else {
      clearSnapState(state);
    }

    state.line = [state.polygon.points[point], snappedPointer];

    if (state.slowState.modifiers.Shift) {
      // Previous point will be used to give an angle offset to snap to.
      let prevAngle = 0;
      if (state.polygon.points.length > 1) {
        const point = state.selectedPoints[0];
        if (point === 0) {
          prevAngle = Math.atan2(
            state.polygon.points[1][1] - state.polygon.points[0][1],
            state.polygon.points[1][0] - state.polygon.points[0][0],
          );
        } else {
          prevAngle = Math.atan2(
            state.polygon.points[point - 1][1] - state.polygon.points[point][1],
            state.polygon.points[point - 1][0] - state.polygon.points[point][0],
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
      if (resp.tool) {
        setTool(resp.tool);
      }
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

        // Auto-switch tools based on shape completion
        if (resp.isOpen === false && state.slowState.currentTool === 'pen') {
          // Shape was just closed with pen tool, switch to pointer for manipulation
          setTimeout(() => {
            setTool('pointer');
          }, 50);
        } else if (resp.isOpen === true && state.slowState.currentTool === 'pointer') {
          // Shape was opened with pointer tool, switch to pen for editing
          setTimeout(() => {
            setTool('pen');
          }, 50);
        }
      }
      pushUndo({
        isOpen: state.isOpen,
        points: state.polygon.points,
        selectedPoints: state.selectedPoints,
      });

      // Update tool visibility after commit changes
      updateToolVisibility(state.slowState.currentTool);
    }
    setState({ transitionModifiers: null });
  }

  function validate(intent: ActionIntent | TransitionIntent) {
    // Check if this intent is available for the current tool
    if (!intent.tools.includes(state.slowState.currentTool)) {
      return false;
    }

    // Create a safe pointer array for validation
    let pointers: Point[] = [];
    if (
      state.pointer &&
      Array.isArray(state.pointer) &&
      state.pointer.length >= 2 &&
      typeof state.pointer[0] === 'number' &&
      typeof state.pointer[1] === 'number'
    ) {
      pointers = [state.pointer];
    }

    // Check if the intent is valid in the current state
    const result = intent.isValid(pointers, state, getModifiers());

    // For debugging - log valid intents
    if (result && process.env.NODE_ENV !== 'production') {
      console.debug(`Valid intent for ${state.slowState.currentTool}: ${intent.type} - ${intent.label}`);
    }

    return result;
  }

  function triggerKeyAction(key: string) {
    if (key === 'Delete') {
      key = 'Backspace';
    }
    const currentTool = state.slowState.currentTool;
    for (const keyIntent of keyIntents) {
      if (keyIntent.trigger.type !== 'key' || keyIntent.trigger.key !== key) continue;
      // Skip intents that don't apply to the current tool
      if (!keyIntent.tools.includes(currentTool)) continue;
      if (validate(keyIntent)) {
        commit(keyIntent);
        return true;
      }
    }
    return false;
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
      setState({
        modifiers: {
          Alt: false,
          Shift: false,
          Meta: false,
          proximity: BASE_PROXIMITY,
        },
      });
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
        modifiers: {
          ...(internals.nextSlowState?.modifiers || state.slowState.modifiers),
          [modifier]: true,
        },
      });
    },
    unset(modifier: string) {
      if (modifier !== 'Shift' && modifier !== 'Alt' && modifier !== 'Meta') return;
      setState({
        modifiers: {
          ...(internals.nextSlowState?.modifiers || state.slowState.modifiers),
          [modifier]: false,
        },
      });
    },
  };

  const stamps = {
    set(selectedStamp: InputShape | null) {
      setState({
        selectedStamp,
        boxMode: selectedStamp ? selectedStamp.id === 'square' || selectedStamp.id === 'rectangle' : false,
      });
    },
    clear() {
      stamps.set(null);
    },
    square() {
      stamps.set(shapes.square);
    },
    triangle() {
      stamps.set(shapes.triangle);
    },
    pentagon() {
      stamps.set(shapes.pentagon);
    },
    hexagon() {
      stamps.set(shapes.hexagon);
    },
    circle() {
      stamps.set(shapes.circle);
    },
  };

  // Key manager
  // This will trigger key-based actions. It should be hooked up to
  // the container for the SVG element.
  const key = {
    down(inputKey: string) {
      const key = keyboardShortcutMapping[inputKey] || inputKey;
      if (key === 'Shift' || key === 'Alt' || key === 'Meta') {
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

      // Tool shortcuts
      if (!state.slowState.modifiers.Meta && !state.slowState.modifiers.Alt && !state.slowState.transitioning) {
        const toolKey = key.toUpperCase();

        if (toolMap[toolKey]) {
          const newTool = toolMap[toolKey];

          // Log tool change (only in non-production)
          if (process.env.NODE_ENV !== 'production') {
            console.debug(`Tool change: ${state.slowState.currentTool} -> ${newTool} (via keyboard)`);
          }

          setTool(newTool);
          return true;
        }
      }

      return triggerKeyAction(key);
    },
    up(inputKey: string) {
      const key = keyboardShortcutMapping[inputKey] || inputKey;
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
    // Safety checks for invalid inputs
    if (!pointers || !Array.isArray(pointers) || pointers.length === 0) {
      return;
    }

    // @todo come back later to support multiple pointers (multi-touch)
    const pointerA = pointers[0];

    // Check if pointer is valid with x and y coordinates
    if (!pointerA || (!pointerA[0] && pointerA[0] !== 0) || (!pointerA[1] && pointerA[1] !== 0)) {
      return;
    }

    if (Number.isNaN(pointerA[0]) || Number.isNaN(pointerA[1])) {
      return;
    }

    state.pointer = pointerA;

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
    state.lineBox = null;
    state.line = null;
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
      closestPoint: null,
      pointerInsideShape: false,
      boxMode: false,
      fixedAspectRatio,
    });
    setTool(initialTool);
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

  function lockAspectRatio() {
    setState({ fixedAspectRatio: true });
  }

  function unlockAspectRatio() {
    setState({ fixedAspectRatio: false });
  }

  // Tools
  // Tool management functions
  function setTool(tool: ValidTools) {
    // Skip if already on this tool
    if (state.slowState.currentTool === tool) {
      return;
    }

    // Cancel any ongoing transition when switching tools
    if (state.slowState.transitioning) {
      state.transitionPoints = null;
      state.transitionBoundingBox = null;
      state.transitionDraw = [];
      state.line = null;
      state.lineBox = null;
      setState({ transitioning: false });
    }

    // Reset all tool states
    const newTools = {
      hand: false,
      pointer: false,
      lineBox: false,
      stamp: false,
      box: false,
      pen: false,
      pencil: false,
      line: false,
    };

    // Set the requested tool to true
    newTools[tool] = true;

    // Get valid intents for this tool (for UI hints)
    const validIntentKeys = getValidIntentsForTool(tool);

    // Smart state management for tool switching
    let selectedPoints = state.selectedPoints;
    let isOpen = state.isOpen;
    const selectedStamp = state.slowState.selectedStamp;

    // Tool-specific state management
    switch (tool) {
      case 'pointer':
        // If switching from another tool and we have a full shape, select all points
        if (state.polygon.points.length > 0 && !isOpen && selectedPoints.length === 0) {
          selectedPoints = state.polygon.points.map((_, idx) => idx);
        }
        break;

      case 'pen':
        // Pen tool: prepare for drawing/editing
        if (state.polygon.points.length === 0) {
          selectedPoints = [];
          isOpen = true;
        } else if (!isOpen) {
          // If closed shape, select the last point to continue drawing
          // selectedPoints = [state.polygon.points.length - 1];
          // isOpen = true;
          // NO.
        } else if (selectedPoints.length > 1) {
          // If multiple points selected, keep only the last one
          selectedPoints = [selectedPoints[selectedPoints.length - 1]];
        }
        break;

      case 'line':
        // Line tool: similar to pen but enforce line mode
        if (state.polygon.points.length === 0) {
          selectedPoints = [];
          isOpen = true;
        } else if (!isOpen) {
          selectedPoints = [state.polygon.points.length - 1];
          isOpen = true;
        } else if (selectedPoints.length > 1) {
          selectedPoints = [selectedPoints[selectedPoints.length - 1]];
        }
        break;

      case 'pencil':
        // Pencil tool: always start fresh for freehand drawing
        selectedPoints = [];
        if (state.polygon.points.length === 0) {
          isOpen = true;
        }
        break;

      case 'box':
        // Box tool: clear selection, use stamps
        selectedPoints = [];
        isOpen = false;
        stamps.square();
        break;

      case 'lineBox':
        // Line box tool: clear selection
        selectedPoints = [];
        if (state.polygon.points.length === 0) {
          isOpen = true;
        }
        break;

      case 'stamp':
        // Stamp tool: clear selection, ensure we have a stamp
        selectedPoints = [];
        isOpen = false;
        if (!selectedStamp) {
          stamps.square();
        }
        break;

      case 'hand':
        // Hand tool: clear selection, disable drawing
        selectedPoints = [];
        // Keep current open/closed state
        break;

      default:
        // Default: clear selection
        selectedPoints = [];
        break;
    }

    // Update related mode flags based on the tool
    setState({
      currentTool: tool,
      tools: newTools,
      validIntentKeys,
      selectedPoints,
      // Set appropriate mode flags based on tool
      boxMode: tool === 'box',
    });

    // Update actual state
    state.selectedPoints = selectedPoints;
    state.isOpen = isOpen;

    // Update visibility settings based on the new tool
    updateToolVisibility(tool);

    // Update UI with current valid intents
    updateCurrentIntent();

    // Log tool change (only in non-production)
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`Tool changed: ${tool}, selectedPoints: ${selectedPoints.length}, isOpen: ${isOpen}`);
    }
  }

  /**
   * Updates the UI component visibility based on the current tool
   * This helps provide appropriate context for each tool
   */
  function updateToolVisibility(tool: ValidTools) {
    // Calculate if we should show bounding box
    const shouldShowBoundingBox =
      tool === 'box' ||
      (tool === 'pointer' &&
        state.polygon.points.length > 2 &&
        state.selectedPoints.length === state.polygon.points.length &&
        !state.isOpen);

    // Set appropriate cursor for each tool
    // let cursor = 'default';
    // switch (tool) {
    //   case 'hand':
    //     cursor = state.slowState.transitioning ? 'grabbing' : 'grab';
    //     break;
    //   case 'pointer':
    //     if (state.slowState.selectedPoints.length > 0) {
    //       cursor = 'move';
    //     } else if (state.slowState.pointerInsideShape) {
    //       cursor = 'pointer';
    //     } else {
    //       cursor = 'default';
    //     }
    //     break;
    //   case 'pen':
    //     if (state.slowState.closestPoint !== null) {
    //       cursor = 'pointer';
    //     } else if (state.slowState.hasClosestLine) {
    //       cursor = 'crosshair';
    //     } else {
    //       cursor = 'crosshair';
    //     }
    //     break;
    //   case 'box':
    //   case 'lineBox':
    //     cursor = 'crosshair';
    //     break;
    //   case 'stamp':
    //     cursor = 'copy';
    //     break;
    //   case 'pencil':
    //     cursor = 'pencil';
    //     break;
    //   case 'line':
    //     cursor = 'crosshair';
    //     break;
    // }

    // Update state with visibility settings
    setState({
      showBoundingBox: shouldShowBoundingBox,
      // cursor,
    });
  }

  function unsetTool(tool: ValidTools) {
    if (state.slowState.currentTool === tool) {
      // If unsetting the current tool, default to pointer
      setTool('pointer');
    } else {
      // Just unset this specific tool
      setState({
        tools: { ...state.slowState.tools, [tool]: false },
      });
    }
  }

  function toggleTool(tool: ValidTools) {
    if (state.slowState.currentTool === tool) {
      // If toggling the current tool, switch to pointer
      setTool('pointer');
    } else {
      // Switch to the requested tool
      setTool(tool);
    }
  }

  // Smart tool switching based on context
  function switchToAppropriateEditingTool() {
    if (state.selectedPoints.length > 0) {
      setTool('pointer');
    } else if (state.isOpen) {
      setTool('pen');
    } else {
      setTool('pointer');
    }
  }

  const history = {
    undo,
    redo,
    get canUndo() {
      return internals.undoStackPointer > -1;
    },
    get canRedo() {
      return internals.undoStackPointer < internals.undoStack.length - 1;
    },
  };

  // Tools API
  const tools = {
    setTool,
    unsetTool,
    toggleTool,
    updateVisibility: updateToolVisibility,
    get current() {
      return state.slowState.currentTool;
    },
    get active() {
      return state.slowState.tools;
    },
    get cursor() {
      return state.slowState.cursor;
    },
    // Tool keyboard shortcut info
    shortcuts: {
      pointer: 'V', // Selection tool
      pen: 'P', // Pen tool
      box: 'B', // Box tool
      lineBox: 'L', // Line box tool
      stamp: 'S', // Stamp tool
      hand: 'H', // Hand tool (pan)
      pencil: 'D', // Pencil tool shortcut
      line: 'N', // Line tool
    },
    // Get the current pan offset
    get panOffset() {
      return state.panOffset;
    },
    // Reset the pan offset to center the view
    resetPan() {
      state.panOffset = { x: 0, y: 0 };
      internals.shouldUpdate = true;
    },
    // List all valid intents for current tool
    getValidIntents(tool?: ValidTools) {
      const targetTool = tool || state.slowState.currentTool;
      return {
        actions: actionIntents.filter((intent) => intent.tools.includes(targetTool)),
        transitions: transitionIntents.filter((intent) => intent.tools.includes(targetTool)),
        keys: keyIntents.filter((intent) => intent.tools.includes(targetTool)),
        // Get all possible intents as a map of intent type to label
        all: getValidIntentsForTool(targetTool),
        // Get currently valid intents at pointer position
        current: state.slowState.validIntentKeys,
      };
    },
    // Get a description of the current tool and its state
    getToolInfo() {
      const tool = state.slowState.currentTool;

      return {
        name: tool,
        cursor: state.slowState.cursor,
        selectionCount: state.selectedPoints.length,
        pointCount: state.polygon.points.length,
        isOpen: state.isOpen,
      };
    },
    // Helper functions for better tool management
    smartSelect() {
      // Smart selection based on current state
      if (state.polygon.points.length === 0) {
        return;
      }

      if (state.isOpen) {
        // Select the last point for continued editing
        state.selectedPoints = [state.polygon.points.length - 1];
        setState({ selectedPoints: state.selectedPoints });
      } else {
        // Select all points for shape manipulation
        state.selectedPoints = state.polygon.points.map((_, idx) => idx);
        setState({ selectedPoints: state.selectedPoints });
      }
    },
    clearSelection() {
      state.selectedPoints = [];
      setState({ selectedPoints: [] });
    },
    // Switch to the most appropriate tool based on current state
    autoSelect() {
      if (state.selectedPoints.length === state.polygon.points.length && !state.isOpen) {
        setTool('pointer');
      } else if (state.isOpen || state.selectedPoints.length > 0) {
        setTool('pen');
      } else {
        setTool('pointer');
      }
    },
  };

  // Initialize tool system
  setTool(initialTool);

  return {
    state,
    modifiers,
    stamps,
    history,
    key,
    setScale,
    clock,
    pointer,
    blur,
    pointerDown,
    pointerUp,
    setShape,
    label,
    tools,
    snap: {
      enabled: () => state.slowState.snapEnabled,
      enable: () => setState({ snapEnabled: true }),
      disable: () => setState({ snapEnabled: false }),
      toggle: () => setState({ snapEnabled: !state.slowState.snapEnabled }),

      // Point snapping
      pointsEnabled: () => state.slowState.snapToPoints,
      enablePoints: () => setState({ snapToPoints: true }),
      disablePoints: () => setState({ snapToPoints: false }),
      togglePoints: () => setState({ snapToPoints: !state.slowState.snapToPoints }),

      // Line snapping
      linesEnabled: () => state.slowState.snapToLines,
      enableLines: () => setState({ snapToLines: true }),
      disableLines: () => setState({ snapToLines: false }),
      toggleLines: () => setState({ snapToLines: !state.slowState.snapToLines }),

      // Intersection snapping
      intersectionsEnabled: () => state.slowState.snapToIntersections,
      enableIntersections: () => setState({ snapToIntersections: true }),
      disableIntersections: () => setState({ snapToIntersections: false }),
      toggleIntersections: () => setState({ snapToIntersections: !state.slowState.snapToIntersections }),

      // Grid snapping (for future use)
      gridEnabled: () => state.slowState.snapToGrid,
      enableGrid: () => setState({ snapToGrid: true }),
      disableGrid: () => setState({ snapToGrid: false }),
      toggleGrid: () => setState({ snapToGrid: !state.slowState.snapToGrid }),

      // Parallel snapping
      parallelEnabled: () => state.slowState.snapToParallel,
      enableParallel: () => setState({ snapToParallel: true }),
      disableParallel: () => setState({ snapToParallel: false }),
      toggleParallel: () => setState({ snapToParallel: !state.slowState.snapToParallel }),

      // Threshold control
      getThreshold: () => state.snapThreshold * state.slowState.modifiers.proximity,
      setThreshold: (threshold: number) => {
        state.snapThreshold = Math.max(5, Math.min(50, threshold)); // Clamp between 5-50 pixels
      },

      // Snap state access
      isActive: () => state.isSnapping,
      getSnapPoint: () => state.snapPoint,
      getActiveGuides: () => state.activeSnapGuides,
      getTargets: () => state.snapTargets,
    },
  };
}

export * from './snap-utils';
export * from './svg-helpers';
export * from './types';
