import { ActionIntent } from '../types';
import { Point } from '../polygon';

const NUDGE_AMOUNT_MODIFIER = 4;

export const nudgeRight: ActionIntent = {
  type: 'nudge-right',
  label: 'Nudge right',
  trigger: { type: 'key', key: 'ArrowRight' },
  modifiers: {
    Shift: 'Nudge right more',
  },
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0;
  },
  commit(pointers, state, modifiers) {
    const dist = modifiers.proximity * 0.3;
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    const newPoints: Point[] = points.map((p, i) => {
      if (selected.includes(i)) {
        return [p[0] + (modifiers.Shift ? NUDGE_AMOUNT_MODIFIER * dist : 1), p[1]];
      }
      return p;
    });
    return { points: newPoints };
  },
};

export const nudgeLeft: ActionIntent = {
  type: 'nudge-left',
  label: 'Nudge left',
  trigger: { type: 'key', key: 'ArrowLeft' },
  modifiers: {
    Shift: 'Nudge left more',
  },
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0;
  },
  commit(pointers, state, modifiers) {
    const dist = modifiers.proximity * 0.3;
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    const newPoints: Point[] = points.map((p, i) => {
      if (selected.includes(i)) {
        return [Math.max(0, p[0] - (modifiers.Shift ? NUDGE_AMOUNT_MODIFIER * dist : 1)), p[1]];
      }
      return p;
    });
    return { points: newPoints };
  },
};

export const nudgeUp: ActionIntent = {
  type: 'nudge-up',
  label: 'Nudge up',
  trigger: { type: 'key', key: 'ArrowUp' },
  modifiers: {
    Shift: 'Nudge up more',
  },
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0;
  },
  commit(pointers, state, modifiers) {
    const dist = modifiers.proximity * 0.3;
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    const newPoints: Point[] = points.map((p, i) => {
      if (selected.includes(i)) {
        const x = p[0];
        const y = Math.max(0, p[1] - (modifiers.Shift ? NUDGE_AMOUNT_MODIFIER * dist : 1));
        if (p.length === 6) {
          return [x, y, p[2], p[3], p[4], p[5]];
        }
        return [x, y];
      }
      return p;
    });
    return { points: newPoints };
  },
};

export const nudgeDown: ActionIntent = {
  type: 'nudge-down',
  label: 'Nudge down',
  trigger: { type: 'key', key: 'ArrowDown' },
  modifiers: {
    Shift: 'Nudge down more',
  },
  isValid(pointers, state, modifiers) {
    return state.selectedPoints.length > 0;
  },
  commit(pointers, state, modifiers) {
    const dist = modifiers.proximity * 0.3;
    const points = state.polygon.points;
    const selected = state.selectedPoints;
    const newPoints: Point[] = points.map((p, i) => {
      const x = p[0];
      const y = Math.max(0, p[1] - (modifiers.Shift ? NUDGE_AMOUNT_MODIFIER * dist : 1));
      if (selected.includes(i)) {
        if (p.length === 6) {
          return [x, y, p[2], p[3], p[4], p[5]];
        }
        return [x, y];
      }
      return p;
    });
    return { points: newPoints };
  },
};
