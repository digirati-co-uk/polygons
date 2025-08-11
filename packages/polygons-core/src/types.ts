import type { Point, Polygon } from './polygon';

export interface SnapTarget {
  type: 'point' | 'line' | 'parallel' | 'intersection' | 'grid';
  point: Point;
  source?: {
    pointIndex?: number;
    lineIndex?: number;
    polygon?: Polygon;
  };
  distance: number;
}

export interface SnapGuide {
  type: 'point' | 'line' | 'cross' | 'parallel-line';
  points: Point[];
  target: SnapTarget;
}

export interface RenderState {
  isOpen: boolean;
  scale: number;
  polygon: Polygon;
  selectedPoints: Array<number>;
  transitionPoints: Array<Point> | null;
  lineBox: null | [Point, Point, Point, Point];
  line: null | [Point, Point];
  transitionOrigin: null | Point;
  transitionBoundingBox: null | {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  };
  transitionRotate: boolean;
  selectionBox: null | { x: number; y: number; width: number; height: number };
  pointer: null | Point;
  closestLinePoint: null | Point;
  closestLineDistance: number;
  closestLineIndex: number;
  transitionDirection: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;
  transitionBezierLine: null | [Point, Point];
  slowState: SlowState;
  transitionDraw: Point[];
  isPanning: boolean;
  panStart: Point | null;
  snapTargets: SnapTarget[];
  activeSnapGuides: SnapGuide[];
  snapThreshold: number;
  isSnapping: boolean;
  snapPoint: Point | null;
}

export interface SlowState {
  shapeId: undefined | string | null;
  noShape: boolean;
  actionIntentType: null | string;
  transitionIntentType: null | string;
  validIntentKeys: Record<string, string>;
  currentModifiers: Record<string, string>;
  transitioning: boolean;
  hasClosestLine: boolean;
  selectedPoints: number[];
  modifiers: Modifiers;
  showBoundingBox: boolean;
  pointerInsideShape: boolean;
  closestPoint: null | number;
  transitionModifiers: Record<string, string> | null;
  selectedStamp: null | InputShape;
  bezierLines: [number, Point, Point][];
  cursor: string;
  bounds: null | { x: number; y: number; width: number; height: number };

  // Modes.
  boxMode: boolean;
  fixedAspectRatio: boolean;
  isToolSwitchingLocked: boolean;
  canDeselect: boolean;
  canDelete: boolean;

  // Tools (better modes)
  enabledTools: ValidTools[];
  currentTool: ValidTools;
  lastCreationTool: ValidTools | null;

  // Snapping
  snapEnabled: boolean;
  snapToPoints: boolean;
  snapToLines: boolean;
  snapToIntersections: boolean;
  snapToGrid: boolean;
  snapToParallel: boolean;
}

/**
 * Tools are are used to interact in different ways.
 *
 * You MIGHT have more than one tool enabled, for example if you are using the pen tool
 * you might select a few points and move them (pointer) and then when you deselect the
 * points you are back to the pen tool.
 *
 * The "Hand" and "Pointer" tools work in this way.
 *
 * Another example might be selecting points with pointer and then switching to the draw tool.
 * This would work by taken the first and last points selected and replacing them with what you draw
 * in the middle.
 *
 */
export type ValidTools = 'line' | 'hand' | 'pointer' | 'lineBox' | 'stamp' | 'box' | 'pen' | 'pencil';

export type InputShape = {
  id?: string;
  points: Point[];
  open: boolean;
};

export type Modifiers = {
  // Keys
  Shift: boolean;
  Alt: boolean;
  Meta: boolean;
  // Proximity
  proximity: number;
};

export type SetState = (state: SlowState | ((prev: SlowState) => SlowState)) => void;

export type RenderFunc = (state: RenderState, slowState: SlowState, dt: number) => void;

export interface TransitionIntent {
  type: string;
  label: string;
  modifiers?: Record<string, string>;
  tools: ValidTools[];
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean;
  start?(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers,
  ): {
    isOpen?: boolean;
    points?: Point[];
    selectedPoints?: number[];
  } | void;
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers): void;
  commit(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers,
  ): { selectedPoints?: number[]; points?: Point[]; isOpen?: boolean; tool?: ValidTools } | void;
}

export interface ActionIntent {
  type: string;
  label: string;
  trigger: { type: 'click' } | { type: 'key'; key: string };
  modifiers?: Record<string, string>;
  tools: ValidTools[];
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean;
  commit(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers,
  ): {
    selectedPoints?: number[];
    points?: Point[];
    isOpen?: boolean;
    tool?: ValidTools;
  } | void;
}
