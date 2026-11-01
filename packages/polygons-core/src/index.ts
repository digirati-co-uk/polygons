import mitt, { type Emitter } from 'mitt';
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
import { moveBezierControl } from './intents/move-bezier-control';
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
import { tapBox as tapBoxIntent, tapBoxPoints } from './intents/tap-box';
import { translateBoundingBox } from './intents/translate-bounding-box';
import { distance, isRectangle, clampXYToBounds } from './math';
import {
  precalculate as _precalculate,
  type Point,
  type Polygon,
  perimeterNearestTo,
  reattachHandles,
  updateBoundingBox,
} from './polygon';
import * as shapes from './shapes';
import {
  applySnapToPointer,
  clearSnapState,
  updateSnapState,
  resolvePoint,
  clampPoint,
  invalidateSnapCache,
} from './snap-utils';
import type {
  ActionIntent,
  InputShape,
  RenderFunc,
  RenderState,
  SetState,
  SlowState,
  TransitionIntent,
  ValidTools,
  PointerType,
  BoxPlacement,
  SnapGrid,
} from './types';

const requestAnimationFrame =
  typeof window !== 'undefined' ? window.requestAnimationFrame : (func: any) => setTimeout(func, 16) as any as number;

const cancelAnimationFrame =
  typeof window !== 'undefined' ? window.cancelAnimationFrame : (id: any) => clearTimeout(id);

function isCreationTool(tool: ValidTools): boolean {
  return !['hand', 'pointer'].includes(tool);
}

export interface CreateHelperInput {
  id?: string;
  open?: boolean;
  points?: Array<Point>;
  tool?: ValidTools;
  fixedAspectRatio?: boolean;
  keyboardShortcutMapping?: Record<string, string>;
  toolMap?: Record<string, ValidTools>;
  keyboardShortcutsEnabled?: boolean;
  enabledTools?: ValidTools[];
  emitter?: Emitter<PolygonEvents>;
  bounds?: { x: number; y: number; width: number; height: number };
  customSetState?: (state: Partial<RenderState>) => void;
  onStateChange?: (state: SlowState) => void;
  pointerType?: PointerType;
  proximity?: number;
  touchProximity?: number;
  dragThreshold?: number;
  boxPlacement?: BoxPlacement;
  dragOffset?: [number, number];
  historyLimit?: number;
}

interface OnSaveOutput {
  id?: string;
  open: boolean;
  points: Array<Point>;
}

export type PolygonEvents = {
  'polygons.start-transition': { transitionIntent: string };
  'polygons.end-transition': { transitionIntent: string; response: ReturnType<TransitionIntent['commit']> };
  'polygons.transition': { transitionIntent: string };
  'polygons.cancel-transition': { transitionIntent: string | null; reason: string };
  'polygons.committed': { transitionIntent: string; shape: InputShape };
};

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
  moveBezierControl,
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

export function createHelper(input: CreateHelperInput | null, onSave: (input: OnSaveOutput) => void) {
  const fixedAspectRatio = input?.fixedAspectRatio || false;
  const initialTool = input?.tool || 'pointer';
  const keyboardShortcutMapping = input?.keyboardShortcutMapping || {};
  const keyboardShortcutsEnabled =
    typeof input?.keyboardShortcutsEnabled === 'boolean' ? input.keyboardShortcutsEnabled : true;
  const enabledTools = input?.enabledTools || ['pointer', 'pen', 'box', 'lineBox', 'stamp', 'hand', 'line', 'pencil'];
  const emitter = input?.emitter || mitt<PolygonEvents>();

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
    bounds: input?.bounds || null,
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
    isToolSwitchingLocked: false,
    canDeselect: false,
    canDelete: true,
    pointerType: input?.pointerType || 'mouse',
    boxPlacement: input?.boxPlacement || 'drag',
    boxPending: false,
    canUndo: false,
    canRedo: false,
    cursor: 'default',
    // Initialize tools with defaults based on initialTool
    enabledTools,
    // Set the current tool
    currentTool: initialTool,
    lastCreationTool: isCreationTool(initialTool) ? initialTool : null,
    // Snapping configuration
    snapEnabled: false,
    snapToPoints: true,
    snapToLines: true,
    snapToCurves: true,
    snapToIntersections: true,
    snapToGrid: false,
    snapToParallel: true,
  };

  // This is state that will change frequently, and used in the clock-managed render function.
  const state: RenderState = {
    isOpen: typeof input?.open === 'boolean' ? input.open : ['pen', 'line', 'lineBox', 'pencil'].includes(initialTool),
    polygon: {
      points: input?.points?.map((p) => [...p] as Point) || [],
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
    isPanning: false,
    panStart: null,
    snapTargets: [],
    activeSnapGuides: [],
    snapThreshold: 15,
    isSnapping: false,
    snapPoint: null,
    rawPointer: null,
    activeHandle: null,
    boxPending: null,
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
    running: false,
    lastFrameTime: null as number | null,
    revision: 0,
  };

  const pointerState = {
    isPressed: false,
    isClicking: false,
    lastPress: null as Point | null,
    pressTimeout: 0,
    noTransition: false,
  };

  let pendingPartial: Partial<SlowState> = {};
  let gestureBaseline: UndoStackItem | null = null;
  let pointerOverride: Point | null = null;
  let blockedByMultiTouch = false;
  let dragOffset: [number, number] = input?.dragOffset || [0, 0];
  const historyLimit = Math.max(2, input?.historyLimit || 100);

  function precalculate(polygon: Polygon) {
    invalidateSnapCache(polygon.points);
    _precalculate(polygon);
    setState({ bezierLines: polygon.bezierLines });
    updateBoundingBox(polygon);
    internals.shouldUpdate = true;
  }

  precalculate(state.polygon);

  // Model changes are synchronous. Only subscriber notifications are batched.
  function setState(newState: Partial<SlowState>) {
    const changed: Partial<SlowState> = {};
    for (const key of Object.keys(newState) as Array<keyof SlowState>) {
      const next = newState[key];
      const current = state.slowState[key];
      if (
        Array.isArray(next) &&
        Array.isArray(current) &&
        next.length === current.length &&
        next.every((v, i) => v === current[i])
      )
        continue;
      if (next !== current) (changed as any)[key] = next;
    }
    if (!Object.keys(changed).length) return;
    state.slowState = { ...state.slowState, ...changed };
    if (changed.selectedPoints) state.selectedPoints = changed.selectedPoints;
    pendingPartial = { ...pendingPartial, ...changed };
    internals.nextSlowState = state.slowState;
    if (changed.snapEnabled === false) clearSnapState(state);
  }

  function refresh() {
    updateBoundingBoxVisibility();
    if (!pointerState.isPressed && !state.slowState.transitioning) {
      updateClosestIntersection();
      updateClosestPoint();
      updateShapeIntersection();
      updateCurrentIntent();
    }
    calculateLine();
    calculateLineBox();
    updateIsRectangle();
    if (!state.slowState.snapEnabled || getModifiers().Shift) clearSnapState(state);
    if (state.boxPending && state.pointer) previewTapBox();
    updatePlacementPreview();
    updateCursor();
  }

  function updatePlacementPreview() {
    state.previewPoint = null;
    if (!state.pointer || state.slowState.noShape) return;
    if (state.slowState.transitioning) {
      state.previewPoint = state.activeHandle || null;
      return;
    }
    const type = state.slowState.actionIntentType;
    if (state.isOpen && (type === 'close-shape' || type === 'close-shape-line')) {
      const opposite = state.selectedPoints[0] === 0 ? state.polygon.points.length - 1 : 0;
      state.previewPoint = state.polygon.points[opposite];
      if (state.line) state.line = [state.line[0], state.previewPoint];
      return;
    }
    if (state.slowState.transitionIntentType === 'split-line' && state.closestLinePoint) {
      // With Alt held the drag bends the line instead, so there is no new point to preview.
      if (getModifiers().Alt) return;
      // Hovering a line: show exactly where the new point will land.
      state.previewPoint = state.closestLinePoint;
      return;
    }
    const tool = state.slowState.currentTool;
    const placement = state.isOpen && ['pen', 'line', 'lineBox', 'pencil'].includes(tool);
    const stamp =
      ['box', 'stamp'].includes(tool) &&
      (!state.polygon.points.length || state.slowState.transitionIntentType === 'stamp-shape');
    if (placement || stamp || state.boxPending) {
      state.previewPoint = state.line?.[1] || resolvePoint(state.pointer, state, { disableSnap: getModifiers().Shift });
    }
  }

  function updateCursor() {
    const slow = state.slowState;
    let cursor = ['pen', 'box', 'line', 'lineBox', 'stamp', 'pencil'].includes(slow.currentTool)
      ? 'crosshair'
      : 'default';
    const intent = slow.transitionIntentType;
    if (slow.currentTool === 'hand') cursor = slow.transitioning ? 'grabbing' : 'grab';
    else if (['close-shape', 'close-shape-line'].includes(slow.actionIntentType || '')) cursor = 'pointer';
    else if (intent === 'move-bezier-control') cursor = slow.transitioning ? 'grabbing' : 'grab';
    else if (intent === 'bounding-box-corners' || (intent === 'move-point' && slow.boxMode)) {
      cursor = state.transitionRotate
        ? 'alias'
        : state.transitionDirection === 'ne' || state.transitionDirection === 'sw'
        ? 'nesw-resize'
        : 'nwse-resize';
    } else if (['move-point', 'move-line', 'move-shape', 'move-bounding-box'].includes(intent || ''))
      cursor = slow.transitioning ? 'grabbing' : 'move';
    else if (intent === 'select-multiple-points') cursor = 'crosshair';
    else if (intent === 'split-line' || slow.actionIntentType === 'cut-line') cursor = 'copy';
    setState({ cursor });
  }

  function clockFunction(delta: number, stop = false) {
    internals.time += delta;
    refresh();
    flushSetState();
    internals.renderFunc(state, state.slowState, delta);
    if (!stop) scheduleFrame();
  }

  function scheduleFrame() {
    if (!internals.running || internals.animationFrame) return;
    internals.animationFrame = requestAnimationFrame((timestamp: number) => {
      internals.animationFrame = 0;
      const delta = internals.lastFrameTime === null ? 0 : timestamp - internals.lastFrameTime;
      internals.lastFrameTime = timestamp;
      clockFunction(Number.isFinite(delta) ? delta : 16);
    });
  }

  // Clock update functions
  // ======================
  // These are called on each frame. They may run at different "frame rates"
  // in the future if there are performance issues.
  // They should be listed here in the order they are called, so this section
  // can be read as the "clock".
  function flushSetState() {
    const partial = pendingPartial;
    pendingPartial = {};
    internals.nextSlowState = null;
    if (Object.keys(partial).length) {
      internals.setStateFunc(state.slowState);
      input?.customSetState?.(partial as Partial<RenderState>);
      input?.onStateChange?.(state.slowState);
    }
    if (internals.shouldUpdate) {
      internals.shouldUpdate = false;
      onSave({ id: state.slowState.shapeId || undefined, open: state.isOpen, points: state.polygon.points });
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
    state.selectedPoints = [...resp.selectedPoints];
    setState({ selectedPoints: resp.selectedPoints });

    state.polygon.points = resp.points.map((p) => [...p] as Point);
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

  function snapshot(): UndoStackItem {
    return {
      isOpen: state.isOpen,
      points: state.polygon.points.map((p) => [...p] as Point),
      selectedPoints: [...state.selectedPoints],
    };
  }

  function updateHistoryState() {
    setState({
      canUndo: internals.undoStackPointer > 0,
      canRedo: internals.undoStackPointer < internals.undoStack.length - 1,
    });
  }

  function undo() {
    cancelGesture('undo');
    if (internals.undoStackPointer <= 0) return;
    applyUndo(internals.undoStack[--internals.undoStackPointer]);
    updateHistoryState();
  }

  function redo() {
    cancelGesture('redo');
    if (internals.undoStackPointer >= internals.undoStack.length - 1) return;
    applyUndo(internals.undoStack[++internals.undoStackPointer]);
    updateHistoryState();
  }

  function pushUndo(resp: UndoStackItem) {
    const previous = internals.undoStack[internals.undoStackPointer];
    if (previous && previous.isOpen === resp.isOpen && JSON.stringify(previous.points) === JSON.stringify(resp.points))
      return;
    internals.undoStack.splice(internals.undoStackPointer + 1);
    internals.undoStack.push({
      isOpen: resp.isOpen,
      points: resp.points.map((p) => [...p] as Point),
      selectedPoints: [...resp.selectedPoints],
    });
    if (internals.undoStack.length > historyLimit) internals.undoStack.shift();
    internals.undoStackPointer = internals.undoStack.length - 1;
    updateHistoryState();
  }

  function updateIsRectangle() {
    // An open outline that merely looks rectangular is still being drawn: it must stay closable.
    setState({ boxMode: !state.isOpen && !state.polygon.isBezier && isRectangle(state.polygon.points || []) });
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
    let nearest = 0;
    let best = Infinity;
    state.polygon.points.forEach((point, idx) => {
      const d = (point[0] - x) ** 2 + (point[1] - y) ** 2;
      if (d < best) {
        best = d;
        nearest = idx;
      }
    });
    setState({ closestPoint: nearest });
  }

  function updateClosestIntersection() {
    if (!state.pointer || state.slowState.transitioning) return;

    if (state.slowState.noShape) {
      state.closestLineIndex = -1;
      state.closestLinePoint = null;
      state.closestLineDistance = 0;
      return;
    }

    const [intersection, distance, line, prevIdx] = perimeterNearestTo(state.polygon, state.pointer, state.isOpen);

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

    // Update UI visibility based on current tool
    updateToolVisibility(currentTool);

    // Do some calculations for the intents to use, and also to update the pending UI.
    let didSetTransition = false;
    // We are not yet transitioning, and need to feed back to the user.
    for (let i = 0; i < transitionIntentsLength; i++) {
      const intent = transitionIntents[i];
      if (intent.type === 'snap') continue;
      // Skip intents that don't apply to the current tool
      if (!intent.tools.includes(currentTool)) continue;

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
        setState({ transitionIntentType: null });
        internals.transitionIntent = null;
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
    if (
      !pointer ||
      !isDrawing() ||
      state.slowState.noShape ||
      state.slowState.transitioning ||
      !['pen', 'line', 'lineBox'].includes(state.slowState.currentTool)
    ) {
      state.line = null;
      return;
    }

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

  function applyResponse(resp: ReturnType<ActionIntent['commit']>, type: string) {
    if (!resp) return;
    if (resp.points && !resp.points.every((p) => (p.length === 2 || p.length === 6) && p.every(Number.isFinite)))
      return;
    if (resp.points) {
      state.polygon.points = resp.points.map((p) => clampPoint(p, state));
      state.polygon.boundingBox = null;
      state.polygon.iedges = null;
      state.polygon.isBezier = null;
      precalculate(state.polygon);
      setState({ closestPoint: null });
    }
    if (typeof resp.isOpen === 'boolean') {
      state.isOpen = resp.isOpen;
      internals.shouldUpdate = true;
    }
    if (resp.selectedPoints) setState({ selectedPoints: resp.selectedPoints });
    if (resp.tool) setTool(resp.tool);
    pushUndo(snapshot());
    setState({ transitionModifiers: null });
    emitter.emit('polygons.committed', {
      transitionIntent: type,
      shape: { id: state.slowState.shapeId || undefined, open: state.isOpen, points: state.polygon.points },
    });
  }

  function commit(intent: ActionIntent | TransitionIntent) {
    const revision = internals.revision;
    const resp = intent.commit([pointerState.lastPress || state.pointer || [0, 0]], state, getModifiers());
    // Keep the legacy event order, but never overwrite a replacement made by its listener.
    emitter.emit('polygons.end-transition', { transitionIntent: intent.type, response: resp });
    if (revision !== internals.revision) return;
    applyResponse(resp, intent.type);
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
        if (keyIntent.type === 'toggle-snap') {
          snap.toggle();
          return true;
        }
        if (keyIntent.type.startsWith('nudge-')) {
          const amount = getModifiers().Shift ? BASE_PROXIMITY * state.scale * 1.2 : 1;
          nudge(
            key === 'ArrowRight' ? amount : key === 'ArrowLeft' ? -amount : 0,
            key === 'ArrowDown' ? amount : key === 'ArrowUp' ? -amount : 0
          );
          return true;
        }
        // A key edit must not leave a drag response that can overwrite it on release.
        const selectedPoints = state.selectedPoints;
        cancelGesture('key-action');
        setState({ selectedPoints });
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
          proximity: getProximity(),
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
      const isBox = selectedStamp ? selectedStamp.id === 'square' || selectedStamp.id === 'rectangle' : false;
      setState({ selectedStamp, boxMode: isBox });
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
      if (key === 'Escape' && (pointerState.isPressed || state.slowState.transitioning || state.boxPending)) {
        cancelGesture('escape');
        return true;
      }
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
        if (!keyboardShortcutsEnabled) return;
        const toolKey = key.toUpperCase();

        if (toolMap[toolKey]) {
          const newTool = toolMap[toolKey];

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
    if (!Number.isFinite(scale) || scale <= 0) return;
    state.scale = scale;
    setState({ modifiers: { ...getModifiers(), proximity: getProximity() } });
    clearSnapState(state);
  }

  function getProximity() {
    const base = input?.proximity ?? BASE_PROXIMITY;
    return Math.max(base, state.slowState.pointerType === 'touch' ? input?.touchProximity ?? 22 : base) * state.scale;
  }

  function setPointerType(type: PointerType) {
    setState({ pointerType: type });
    setState({ modifiers: { ...getModifiers(), proximity: getProximity() } });
  }

  // Clock
  // Gives granular control over the clock, and allows you to hook into it.
  // Also allows you to test the functionality or debug by stepping
  const clock = {
    set: (renderFunc: RenderFunc) => {
      internals.renderFunc = renderFunc;
    },
    start: (renderFunc?: RenderFunc, setStateFunc?: SetState) => {
      if (renderFunc) internals.renderFunc = renderFunc;
      if (setStateFunc) {
        internals.setStateFunc = setStateFunc;
        setStateFunc(state.slowState);
      }
      if (internals.running) return;
      internals.running = true;
      internals.lastFrameTime = null;
      clockFunction(0);
    },
    stop: () => {
      internals.running = false;
      if (internals.animationFrame) cancelAnimationFrame(internals.animationFrame);
      internals.animationFrame = 0;
      internals.lastFrameTime = null;
    },
    // Preserve legacy step scheduling. New hosts can flush without starting a loop.
    step: (deltaTime = 16) => {
      internals.running = true;
      clockFunction(deltaTime);
    },
    flush: (deltaTime = 0) => clockFunction(deltaTime, true),
  };

  function validPoint(p: Point | null | undefined): p is Point {
    return !!p && (p.length === 2 || p.length === 6) && p.every(Number.isFinite);
  }

  function clearGestureState() {
    clearTimeout(pointerState.pressTimeout);
    pointerState.isPressed = false;
    pointerState.isClicking = false;
    pointerState.lastPress = null;
    pointerState.noTransition = false;
    internals.transitionIntent = null;
    internals.actionIntent = null;
    state.transitionPoints = null;
    state.transitionBoundingBox = null;
    state.transitionOrigin = null;
    state.transitionDirection = null;
    state.transitionRotate = false;
    state.transitionBezierLine = null;
    state.transitionDraw = [];
    state.selectionBox = null;
    state.line = null;
    state.lineBox = null;
    state.activeHandle = null;
    state.activeBezierControl = null;
    state.previewPoint = null;
    state.boxPending = null;
    clearSnapState(state);
    setState({
      transitioning: false,
      transitionIntentType: null,
      actionIntentType: null,
      transitionModifiers: null,
      boxPending: false,
    });
  }

  function cancelGesture(reason = 'cancelled') {
    // Also invalidates a response being delivered to synchronous event listeners.
    internals.revision++;
    const active = pointerState.isPressed || state.slowState.transitioning || !!state.boxPending;
    const type = state.slowState.transitionIntentType;
    if (gestureBaseline) {
      setState({ selectedPoints: gestureBaseline.selectedPoints });
      state.isOpen = gestureBaseline.isOpen;
    }
    gestureBaseline = null;
    clearGestureState();
    if (active) emitter.emit('polygons.cancel-transition', { transitionIntent: type, reason });
  }

  function transitionPointer(): Point {
    const p = state.pointer!;
    if (
      state.slowState.transitionIntentType === 'move-point' ||
      state.slowState.transitionIntentType === 'bounding-box-corners'
    ) {
      return [p[0] + dragOffset[0] * state.scale, p[1] + dragOffset[1] * state.scale];
    }
    return p;
  }

  function pointer(pointers: Point[]) {
    if (!Array.isArray(pointers) || !pointers.length) return;
    if (pointers.length > 1) {
      cancelGesture('multiple-pointers');
      blockedByMultiTouch = true;
      return;
    }
    if (blockedByMultiTouch || !validPoint(pointers[0])) return;
    state.rawPointer = pointers[0];
    state.pointer = pointerOverride || pointers[0];
    if (state.boxPending) {
      previewTapBox();
      return;
    }
    if (state.slowState.transitioning && internals.transitionIntent) {
      internals.transitionIntent.transition([transitionPointer()], state, getModifiers());
      emitter.emit('polygons.transition', { transitionIntent: internals.transitionIntent.type });
    } else if (pointerState.isPressed && pointerState.lastPress && !pointerState.noTransition) {
      const threshold = (input?.dragThreshold ?? 10) * state.scale;
      if (distance(pointerState.lastPress, state.pointer) > threshold && internals.transitionIntent) {
        const intent = internals.transitionIntent;
        gestureBaseline = snapshot();
        pointerState.isClicking = false;
        state.transitionOrigin = pointerState.lastPress;
        setState({ transitioning: true, transitionModifiers: intent.modifiers || null });
        const resp = intent.start?.([pointerState.lastPress], state, getModifiers());
        if (resp?.selectedPoints) setState({ selectedPoints: resp.selectedPoints });
        const revision = internals.revision;
        emitter.emit('polygons.start-transition', { transitionIntent: intent.type });
        if (revision !== internals.revision || !state.slowState.transitioning) return;
        intent.transition([transitionPointer()], state, getModifiers());
        emitter.emit('polygons.transition', { transitionIntent: intent.type });
      }
    } else refresh();
  }

  function blur() {
    cancelGesture('blur');
    state.pointer = null;
    state.rawPointer = null;
    setState({ closestPoint: null, hasClosestLine: false, pointerInsideShape: false });
    state.closestLineIndex = -1;
    state.closestLinePoint = null;
    updateCursor();
  }

  function pointerDown(): void;
  function pointerDown(point: Point): void;
  function pointerDown(point?: Point) {
    if (blockedByMultiTouch) return;
    if (point) pointer([point]);
    if (!state.pointer || state.slowState.noShape || pointerState.isPressed) return;
    refresh();
    pointerState.lastPress = state.pointer;
    pointerState.isPressed = true;
    pointerState.isClicking = true;
    if (state.slowState.currentTool === 'box' && state.slowState.boxPlacement === 'tap') {
      internals.transitionIntent = null;
      setState({ transitionIntentType: null });
    }
  }

  function pointerUp(): void;
  function pointerUp(point: Point): void;
  function pointerUp(point?: Point) {
    if (blockedByMultiTouch) {
      blockedByMultiTouch = false;
      return;
    }
    if (!pointerState.isPressed) return;
    if (point) pointer([point]);
    const intent = internals.transitionIntent;
    const action = internals.actionIntent;
    // A successful commit may switch tools; it is no longer an active press.
    pointerState.isPressed = false;
    if (state.slowState.transitioning && intent) {
      setState({ transitioning: false });
      commit(intent);
    } else if (pointerState.isClicking) {
      if (state.slowState.currentTool === 'box' && state.slowState.boxPlacement === 'tap') tapBox();
      else if (action) commit(action);
    }
    gestureBaseline = null;
    // Keep a pending two-tap box between presses.
    const pending = state.boxPending;
    const preview = pending ? state.transitionPoints : null;
    clearGestureState();
    if (pending) {
      state.boxPending = pending;
      state.transitionPoints = preview;
      setState({ boxPending: true });
    }
    refresh();
  }

  // setShape
  function setShape(shape: InputShape | null) {
    internals.revision++;
    cancelGesture('shape-replaced');
    blockedByMultiTouch = false;
    pointerOverride = null;
    state.pointer = null;
    state.rawPointer = null;
    state.polygon.points = shape?.points.map((p) => [...p] as Point) || [];
    state.polygon.boundingBox = null;
    state.polygon.iedges = null;
    state.isOpen = shape?.open || false;
    setState({
      noShape: shape === null,
      shapeId: shape?.id || null,
      selectedPoints: [],
      closestPoint: null,
      hasClosestLine: false,
      pointerInsideShape: false,
      selectedStamp: null,
      fixedAspectRatio,
    });
    state.closestLineIndex = -1;
    state.closestLinePoint = null;
    modifiers.reset();
    setTool(initialTool, true);
    precalculate(state.polygon);
    internals.undoStack = [snapshot()];
    internals.undoStackPointer = 0;
    updateHistoryState();
    flushSetState();
  }

  function setBoxPlacement(placement: BoxPlacement) {
    cancelGesture('placement-changed');
    setState({ boxPlacement: placement });
  }

  function previewTapBox() {
    if (!state.boxPending || !state.pointer) return;
    const point = resolvePoint(state.pointer, state, { disableSnap: getModifiers().Shift });
    state.transitionPoints = tapBoxPoints(state.boxPending, point, state);
    state.activeHandle = point;
  }

  function tapBox() {
    if (!tapBoxIntent.isValid([state.pointer!], state, getModifiers())) return;
    const resp = tapBoxIntent.commit([state.pointer!], state, getModifiers());
    if (resp) applyResponse(resp, 'tap-box');
    setState({ boxPending: !!state.boxPending });
    previewTapBox();
  }

  function setPointerOverride(point: Point | null) {
    if (point && !validPoint(point)) return;
    pointerOverride = point;
    state.pointer = point || state.rawPointer || null;
    refresh();
  }

  function addPointAt(point: Point) {
    if (!validPoint(point) || !state.isOpen || state.slowState.noShape || state.slowState.transitioning) return false;
    if (!['pen', 'line', 'lineBox'].includes(state.slowState.currentTool)) return false;
    const resolved = resolvePoint(point, state, { disableSnap: getModifiers().Shift });
    if (state.polygon.points.length && !state.selectedPoints.length)
      setState({ selectedPoints: [state.polygon.points.length - 1] });
    if (!addOpenPoint.isValid([resolved], state, getModifiers())) return false;
    // The command receives a world position; an old preview must not override it.
    state.line = null;
    applyResponse(addOpenPoint.commit([resolved], state, getModifiers()), 'add-open-point');
    flushSetState();
    return true;
  }

  function finishShape(options: { close?: boolean } = {}) {
    const close = options.close ?? state.slowState.currentTool !== 'line';
    if (!state.isOpen || state.polygon.points.length < (close ? 3 : 2)) return false;
    cancelGesture('finish');
    applyResponse({ isOpen: !close, selectedPoints: [], tool: 'pointer' }, 'finish-shape');
    flushSetState();
    return true;
  }

  function undoLastPoint() {
    if (!state.isOpen || !state.polygon.points.length) return false;
    cancelGesture('undo-point');
    const fromStart = state.selectedPoints[0] === 0;
    const points = fromStart ? state.polygon.points.slice(1) : state.polygon.points.slice(0, -1);
    applyResponse(
      { points, isOpen: true, selectedPoints: points.length ? [fromStart ? 0 : points.length - 1] : [] },
      'undo-last-point'
    );
    flushSetState();
    return true;
  }

  function nudge(dx: number, dy: number, options: { screenPixels?: boolean } = {}) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !state.selectedPoints.length || state.slowState.transitioning)
      return false;
    const scale = options.screenPixels ? state.scale : 1;
    const selected = new Set(state.selectedPoints);
    const anchors = state.polygon.points.filter((_, i) => selected.has(i));
    if (!anchors.length) return false;
    const xs = anchors.map((p) => p[0]),
      ys = anchors.map((p) => p[1]);
    const box = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const [worldDx, worldDy] = clampXYToBounds(dx * scale, dy * scale, box, state.slowState.bounds);
    const points = state.polygon.points.map((p, i) => {
      if (!selected.has(i)) return p;
      const x = p[0] + worldDx,
        y = p[1] + worldDy;
      return (p.length === 6 ? [x, y, p[2], p[3], p[4], p[5]] : [x, y]) as Point;
    });
    applyResponse({ points: reattachHandles(state.polygon.points, points, state.isOpen) }, 'nudge');
    flushSetState();
    return true;
  }

  function setBezierControl(pointIndex: number, control: 0 | 1, target: Point) {
    const point = state.polygon.points[pointIndex];
    if (
      (control !== 0 && control !== 1) ||
      !point ||
      point.length !== 6 ||
      !validPoint(target) ||
      state.slowState.transitioning
    )
      return false;
    const clamped = clampPoint(target, state);
    const changed = [...point] as Point;
    const index = 2 + control * 2;
    changed[index] = clamped[0] - point[0];
    changed[index + 1] = clamped[1] - point[1];
    applyResponse(
      { points: state.polygon.points.map((p, i) => (i === pointIndex ? changed : p)) },
      'set-bezier-control'
    );
    flushSetState();
    return true;
  }

  /** Perpendicular offset factor for a new curve: small, so the result reads as a gentle arc. */
  const CURVE_BULGE = 0.12;

  /** Unit-length outward normal (away from the shape's interior) for the edge `from -> to`. */
  function outwardNormal(from: Point, to: Point): Point {
    const pts = state.polygon.points;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const dx = to[0] - from[0],
      dy = to[1] - from[1];
    // In y-down coordinates a positive shoelace sum is clockwise on screen, whose outward normal is (dy, -dx).
    return area >= 0 ? [dy, -dx] : [-dy, dx];
  }

  function setCurve(pointIndex: number, enabled = true) {
    const point = state.polygon.points[pointIndex];
    const next = state.polygon.points[(pointIndex + 1) % state.polygon.points.length];
    if (
      !point ||
      !next ||
      state.slowState.transitioning ||
      (state.isOpen && pointIndex === state.polygon.points.length - 1)
    )
      return false;
    if (enabled === (point.length === 6)) return true;
    const dx = next[0] - point[0],
      dy = next[1] - point[1];
    // Bulge outwards so a new curve on a closed shape is convex, never a dent.
    const [nx, ny] = outwardNormal(point, next);
    const bulgeX = nx * CURVE_BULGE,
      bulgeY = ny * CURVE_BULGE;
    const changed: Point = enabled
      ? [point[0], point[1], dx / 3 + bulgeX, dy / 3 + bulgeY, (dx * 2) / 3 + bulgeX, (dy * 2) / 3 + bulgeY]
      : [point[0], point[1]];
    applyResponse(
      { points: state.polygon.points.map((p, i) => (i === pointIndex ? changed : p)), selectedPoints: [pointIndex] },
      'set-curve'
    );
    flushSetState();
    return true;
  }

  function neighbours(i: number) {
    const pts = state.polygon.points;
    const n = pts.length;
    if (n < 2 || !pts[i]) return null;
    const prevIndex = (i - 1 + n) % n;
    const nextIndex = (i + 1) % n;
    return {
      prevIndex,
      nextIndex,
      hasPrev: state.isOpen ? i > 0 : true,
      hasNext: state.isOpen ? i < n - 1 : true,
    };
  }

  /** Make a single point smooth: handles sit either side of it, along the line between its neighbours. */
  function setSmoothPoint(i: number, enabled: boolean) {
    const pts = state.polygon.points;
    const around = neighbours(i);
    if (!around) return false;
    const { prevIndex, nextIndex, hasPrev, hasNext } = around;
    const p = pts[i];
    const prev = hasPrev ? pts[prevIndex] : null;
    const next = hasNext ? pts[nextIndex] : null;
    const changed = new Map<number, Point>();
    if (!enabled) {
      if (hasNext && p.length === 6) changed.set(i, [p[0], p[1]]);
      if (prev && prev.length === 6) changed.set(prevIndex, [prev[0], prev[1]]);
    } else {
      const from = prev || p,
        to = next || p;
      let tx = to[0] - from[0],
        ty = to[1] - from[1];
      const length = Math.hypot(tx, ty);
      if (!length) return false;
      tx /= length;
      ty /= length;
      if (next) {
        const out = distance(p, next) / 3;
        const dx = next[0] - p[0],
          dy = next[1] - p[1];
        const keep = p.length === 6 ? [p[4], p[5]] : [(dx * 2) / 3, (dy * 2) / 3];
        changed.set(i, [p[0], p[1], tx * out, ty * out, keep[0], keep[1]]);
      }
      if (prev) {
        const inn = distance(prev, p) / 3;
        const dx = p[0] - prev[0],
          dy = p[1] - prev[1];
        const keep = prev.length === 6 ? [prev[2], prev[3]] : [dx / 3, dy / 3];
        changed.set(prevIndex, [prev[0], prev[1], keep[0], keep[1], dx - tx * inn, dy - ty * inn]);
      }
    }
    if (!changed.size) return true;
    applyResponse({ points: pts.map((q, idx) => changed.get(idx) || q), selectedPoints: [i] }, 'set-curve');
    flushSetState();
    return true;
  }

  /**
   * Align the handles either side of each point so the curve flows through it without a kink.
   * Both handles keep their length. With a single curved side, that handle is lined up with the
   * straight neighbouring edge. Returns the new points, or null when nothing would change.
   */
  function smoothenPoints(indices: number[]): Point[] | null {
    const work: Point[] = state.polygon.points.map((p) => [...p] as Point);
    let changed = false;
    const unit = (x: number, y: number): [number, number] | null => {
      const l = Math.hypot(x, y);
      return l > 1e-9 ? [x / l, y / l] : null;
    };
    for (const i of Array.from(new Set(indices))) {
      const around = neighbours(i);
      if (!around) continue;
      const { prevIndex, nextIndex, hasPrev, hasNext } = around;
      const p = work[i];
      const prev = hasPrev ? work[prevIndex] : null;
      const next = hasNext ? work[nextIndex] : null;
      const outCurved = !!next && p.length === 6;
      const inCurved = !!prev && prev.length === 6;
      if (!outCurved && !inCurved) continue;
      // Handle vectors pointing away from the point.
      const out: [number, number] | null = outCurved ? [p[2]!, p[3]!] : null;
      const inn: [number, number] | null = inCurved ? [prev!.length === 6 ? prev![4]! + prev![0] - p[0] : 0, prev![5]! + prev![1] - p[1]] : null;
      const outLen = out ? Math.hypot(out[0], out[1]) : 0;
      const innLen = inn ? Math.hypot(inn[0], inn[1]) : 0;
      let tangent: [number, number] | null = null; // direction the outgoing handle should point
      if (out && inn) {
        const a = unit(out[0], out[1]);
        const b = unit(-inn[0], -inn[1]);
        tangent = a && b ? unit(a[0] + b[0], a[1] + b[1]) : a || b;
        if (!tangent && next && prev) tangent = unit(next[0] - prev[0], next[1] - prev[1]);
      } else if (out && prev) {
        const back = unit(prev[0] - p[0], prev[1] - p[1]);
        tangent = back ? [-back[0], -back[1]] : null;
      } else if (inn && next) {
        tangent = unit(next[0] - p[0], next[1] - p[1]);
      }
      if (!tangent) continue;
      if (out) {
        const len = outLen || (next ? distance(p, next) / 3 : 0);
        const nx = tangent[0] * len,
          ny = tangent[1] * len;
        if (Math.abs(nx - p[2]!) > 1e-6 || Math.abs(ny - p[3]!) > 1e-6) changed = true;
        work[i] = [p[0], p[1], nx, ny, p[4]!, p[5]!];
      }
      if (inn && prev) {
        const len = innLen || distance(prev, p) / 3;
        const hx = p[0] - tangent[0] * len,
          hy = p[1] - tangent[1] * len;
        const nx = hx - prev[0],
          ny = hy - prev[1];
        if (Math.abs(nx - prev[4]!) > 1e-6 || Math.abs(ny - prev[5]!) > 1e-6) changed = true;
        work[prevIndex] = [prev[0], prev[1], prev[2]!, prev[3]!, nx, ny];
      }
    }
    return changed ? work : null;
  }

  /**
   * Double-click / double-tap at a position. On a point that has curve handles this smoothens it
   * (lines the handles up). Returns whether anything changed.
   */
  function doubleClick(pointer: Point) {
    if (state.slowState.transitioning || !validPoint(pointer)) return false;
    const threshold = getModifiers().proximity;
    let nearest = -1;
    let best = threshold;
    state.polygon.points.forEach((p, i) => {
      const d = Math.hypot(p[0] - pointer[0], p[1] - pointer[1]);
      if (d <= best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest < 0 || !canSmoothen([nearest])) return false;
    state.selectedPoints = [nearest];
    setState({ selectedPoints: [nearest] });
    return smoothen([nearest]);
  }

  /** True when "smoothen" would change something for this selection. */
  function canSmoothen(indices: number[]) {
    return !state.slowState.transitioning && indices.length > 0 && smoothenPoints(indices) !== null;
  }

  function smoothen(indices: number[] = state.selectedPoints) {
    if (state.slowState.transitioning) return false;
    const points = smoothenPoints(indices);
    if (!points) return false;
    applyResponse({ points, selectedPoints: [...state.selectedPoints] }, 'smoothen');
    flushSetState();
    return true;
  }

  /** The segment (identified by its first point) selected by two consecutive points, if any. */
  function segmentFor(indices: number[]): number | null {
    const n = state.polygon.points.length;
    const [a, b] = indices;
    const valid = (from: number) => !state.isOpen || from < n - 1;
    if ((a + 1) % n === b && valid(a)) return a;
    if ((b + 1) % n === a && valid(b)) return b;
    return null;
  }

  /**
   * Curve selection semantics: one point becomes smooth (handles either side of it);
   * two consecutive points curve the segment between them.
   */
  function curveState(indices: number[]) {
    const none = { available: false, curved: false, anyCurved: false };
    const unique = Array.from(new Set(indices));
    const pts = state.polygon.points;
    if (state.slowState.transitioning) return none;
    if (unique.length === 1) {
      const around = neighbours(unique[0]);
      if (!around) return none;
      const flags: boolean[] = [];
      if (around.hasNext) flags.push(pts[unique[0]].length === 6);
      if (around.hasPrev) flags.push(pts[around.prevIndex].length === 6);
      return { available: flags.length > 0, curved: flags.every(Boolean), anyCurved: flags.some(Boolean) };
    }
    if (unique.length === 2) {
      const from = segmentFor(unique);
      if (from === null) return none;
      const curved = pts[from].length === 6;
      return { available: true, curved, anyCurved: curved };
    }
    return none;
  }

  function setCurveAt(indices: number[], enabled = true) {
    if (state.slowState.transitioning) return false;
    const unique = Array.from(new Set(indices));
    if (unique.length === 1) return setSmoothPoint(unique[0], enabled);
    if (unique.length === 2) {
      const from = segmentFor(unique);
      if (from !== null) {
        const ok = setCurve(from, enabled);
        if (ok) {
          state.selectedPoints = unique;
          setState({ selectedPoints: unique });
        }
        return ok;
      }
    }
    return false;
  }

  function moveSelectedPointTo(point: Point) {
    if (!validPoint(point) || state.selectedPoints.length !== 1 || state.slowState.transitioning) return false;
    const i = state.selectedPoints[0];
    const anchor = state.polygon.points[i];
    if (!anchor) return false;
    const target = resolvePoint(point, state, { disableSnap: getModifiers().Shift });
    state.activeHandle = target;
    return nudge(target[0] - anchor[0], target[1] - anchor[1]);
  }

  function label(type: string | null) {
    if (!type) return '';
    const intent = intentMap[type];
    if (!intent || !intent.modifiers) {
      return intent?.label || '';
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
  function setTool(tool: ValidTools, initialize = false) {
    if (state.slowState.isToolSwitchingLocked) {
      return;
    }
    // Skip if already on this tool
    if (!initialize && state.slowState.currentTool === tool) {
      return;
    }

    // Skip if tool is not enabled.
    if (!state.slowState.enabledTools.includes(tool)) {
      return;
    }

    let lastCreationTool = state.slowState.lastCreationTool;
    if (isCreationTool(tool)) {
      if (state.slowState.isToolSwitchingLocked) {
        return;
      }
      lastCreationTool = tool;
    }

    if (state.slowState.transitioning || state.boxPending || pointerState.isPressed) cancelGesture('tool-changed');
    clearSnapState(state);

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
        if (!initialize && state.polygon.points.length > 0 && !isOpen && selectedPoints.length === 0) {
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
        selectedPoints = state.polygon.points.map((_, idx) => idx);
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

    setState({ validIntentKeys });

    // Update related mode flags based on the tool
    setState({
      currentTool: tool,
      selectedPoints,
      lastCreationTool,
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
    updateCursor();
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

  const history = {
    undo,
    redo,
    get canUndo() {
      return internals.undoStackPointer > 0;
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

    setCanDelete(canDelete: boolean) {
      setState({ canDelete });
    },

    /** Allow clicking empty space to clear the selection. Pass `selectAll = false` to leave the selection alone. */
    setCanDeselect(canDeselect: boolean, selectAll = true) {
      if (selectAll) selectAllPoints();
      setState({ canDeselect });
    },

    lockToolSwitching() {
      setState({ isToolSwitchingLocked: true });
    },
    unlockToolSwitching() {
      setState({ isToolSwitchingLocked: false });
    },
    toggleToolSwitching() {
      setState({ isToolSwitchingLocked: !state.slowState.isToolSwitchingLocked });
    },

    // Tool keyboard shortcut info
    shortcuts: Object.fromEntries(Object.entries(toolMap).map(([key, value]) => [value, key])),

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
        setTool(state.slowState.lastCreationTool || 'pen');
      } else {
        setTool('pointer');
      }
    },
  };

  const snap = {
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

    // Curve (Bézier edge) snapping
    curvesEnabled: () => state.slowState.snapToCurves !== false,
    enableCurves: () => setState({ snapToCurves: true }),
    disableCurves: () => setState({ snapToCurves: false }),
    toggleCurves: () => setState({ snapToCurves: state.slowState.snapToCurves === false }),

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
    getThreshold: () => state.snapThreshold,
    getWorldThreshold: () => state.snapThreshold * state.scale,
    setSources: (sources: InputShape[]) => {
      state.snapSources = sources.map((s) => ({ ...s, points: s.points.map((p) => [...p] as Point) }));
      clearSnapState(state);
    },
    setGrid: (grid: SnapGrid) => {
      state.snapGrid = grid;
      clearSnapState(state);
    },
    setThreshold: (threshold: number) => {
      if (!Number.isFinite(threshold)) return;
      state.snapThreshold = Math.max(5, Math.min(50, threshold)); // Clamp between 5-50 pixels
    },

    // Snap state access
    isActive: () => state.isSnapping,
    getSnapPoint: () => state.snapPoint,
    getActiveGuides: () => state.activeSnapGuides,
    getTargets: () => state.snapTargets,
  };

  function selectAllPoints() {
    setState({ selectedPoints: state.polygon.points.map((_, idx) => idx) });
  }

  function setBounds(bounds: null | { x: number; y: number; width: number; height: number }) {
    setState({ bounds });
  }

  // Initialize tool system
  setTool(initialTool, true);
  setPointerType(input?.pointerType || 'mouse');
  internals.undoStack = [snapshot()];
  internals.undoStackPointer = 0;
  updateHistoryState();

  return {
    state,
    setState,
    emitter,
    modifiers,
    stamps,
    history,
    key,
    setScale,
    setPointerType,
    setBoxPlacement,
    setDragOffset: (offset: [number, number]) => {
      if (offset.every(Number.isFinite)) dragOffset = [...offset];
    },
    cancelGesture,
    finishShape,
    finishOpenShape: finishShape,
    undoLastPoint,
    addPointAt,
    moveSelectedPointTo,
    setBezierControl,
    setCurve,
    setCurveAt,
    smoothen,
    canSmoothen,
    doubleClick,
    curveState,
    setPointerOverride,
    nudge,
    clock,
    pointer,
    blur,
    pointerDown,
    pointerUp,
    setShape,
    label,
    tools,
    snap,
    selectAllPoints,
    setBounds,
    lockAspectRatio,
    unlockAspectRatio,
  };
}

export * from './math';
export * from './snap-utils';
export * from './svg-helpers';
export * from './types';
