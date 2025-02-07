import { Point, Polygon } from './polygon';

export interface RenderState {
  isOpen: boolean;
  scale: number;
  polygon: Polygon;
  selectedPoints: Array<number>;
  transitionPoints: Array<Point> | null;
  lineBox: null | [Point, Point, Point, Point];
  line: null | [Point, Point];
  transitionOrigin: null | Point;
  transitionBoundingBox: null | { x: number; y: number; width: number; height: number; rotation?: number };
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
  drawMode: boolean;
  closestPoint: null | number;
  transitionModifiers: Record<string, string> | null;
  selectedStamp: null | InputShape;
  bezierLines: [number, Point, Point][];

  // Modes.
  lineMode: boolean;
  lineBoxMode: boolean;
  boxMode: boolean;
  fixedAspectRatio: boolean;
}

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
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean;
  start?(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers
  ): {
    isOpen?: boolean;
    points?: Point[];
    selectedPoints?: number[];
  } | void;
  transition(pointers: Point[], state: RenderState, modifiers: Modifiers): void;
  commit(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers
  ): { selectedPoints?: number[]; points?: Point[]; isOpen?: boolean } | void;
}

export interface ActionIntent {
  type: string;
  label: string;
  trigger: { type: 'click' } | { type: 'key'; key: string };
  modifiers?: Record<string, string>;
  isValid(pointers: Point[], state: RenderState, modifiers: Modifiers): boolean;
  commit(
    pointers: Point[],
    state: RenderState,
    modifiers: Modifiers
  ): {
    selectedPoints?: number[];
    points?: Point[];
    isOpen?: boolean;
  } | void;
}
