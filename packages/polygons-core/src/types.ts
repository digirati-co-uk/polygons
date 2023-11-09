import { Point, Polygon } from './polygon';

export interface RenderState {
  isOpen: boolean;
  scale: number;
  polygon: Polygon;
  selectedPoints: Array<number>;
  transitionPoints: Array<Point> | null;
  line: null | [Point, Point];
  transitionOrigin: null | Point;
  transitionBoundingBox: null | { x: number; y: number; width: number; height: number; rotation?: number };
  selectionBox: null | { x: number; y: number; width: number; height: number };
  pointer: null | Point;
  closestLinePoint: null | Point;
  closestLineDistance: number;
  closestLineIndex: number;
  transitionDirection: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;
}

export interface SlowState {
  actionIntentType: null | string;
  transitionIntentType: null | string;
  validIntentKeys: Record<string, string>;
  currentModifiers: Record<string, string>;
  transitioning: boolean;
  hasClosestLine: boolean;
  selectedPoints: number[];
  modifiers: Modifiers;
  showBoundingBox: boolean;
}

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
