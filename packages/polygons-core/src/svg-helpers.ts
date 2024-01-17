import { RenderState, SlowState } from './types';
import { simplifyPolygon } from './math';

interface SvgHelpersOptions {
  proximityThreshold?: number;
  closestLinePointFill?: {
    selected: string;
    unselected: string;
  };
  closestLinePointStroke?: {
    selected: string;
    unselected: string;
  };
}

export function createSvgHelpers(options: SvgHelpersOptions = {}) {
  const proximityThreshold = options.proximityThreshold || 10;
  const closestLinePointFill = options.closestLinePointFill || {
    selected: '#fff',
    unselected: 'rgba(255, 255, 255, .5)',
  };
  const closestLinePointStroke = options.closestLinePointStroke || {
    selected: '#000',
    unselected: 'rgba(0, 0, 0, .5)',
  };

  function updateTransitionBoundingBox(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.transitionBoundingBox && slowState.transitioning) {
      el.setAttribute('x', '' + state.transitionBoundingBox.x);
      el.setAttribute('y', '' + state.transitionBoundingBox.y);
      el.setAttribute('width', '' + state.transitionBoundingBox.width);
      el.setAttribute('height', '' + state.transitionBoundingBox.height);
    }
  }

  function updateBoundingBox(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.polygon.boundingBox && slowState.showBoundingBox) {
      el.setAttribute('x', '' + state.polygon.boundingBox.x);
      el.setAttribute('y', '' + state.polygon.boundingBox.y);
      el.setAttribute('width', '' + state.polygon.boundingBox.width);
      el.setAttribute('height', '' + state.polygon.boundingBox.height);
    }
  }
  function updateBoundingBoxPolygon(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.polygon.boundingBox && slowState.showBoundingBox) {
      const bb = state.transitionBoundingBox || state.polygon.boundingBox;

      if (bb.rotation) {
        el.style.transformOrigin = `${bb.x + bb.width / 2}px ${bb.y + bb.height / 2}px`;
        el.style.transform = `rotate(${Math.round(100 * bb.rotation * (180 / Math.PI)) / 100}deg)`;
      } else {
        el.style.transform = '';
      }

      el.setAttribute(
        'points',
        [
          [bb.x, bb.y],
          [bb.x + bb.width, bb.y],
          [bb.x + bb.width, bb.y + bb.height],
          [bb.x, bb.y + bb.height],
        ]
          .map((r) => r.join(','))
          .join(' ')
      );
    }
  }

  function updateTransitionShape(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.transitionPoints && slowState.transitioning) {
      el.setAttribute('points', state.transitionPoints.map((r) => r.join(',')).join(' '));
    }
  }

  function updateClosestLinePoint(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.closestLinePoint && slowState.hasClosestLine) {
      el.setAttribute('cx', '' + state.closestLinePoint[0]);
      el.setAttribute('cy', '' + state.closestLinePoint[1]);
      el.setAttribute(
        'fill',
        state.closestLineDistance < proximityThreshold ? closestLinePointFill.selected : closestLinePointFill.unselected
      );
      el.setAttribute(
        'stroke',
        state.closestLineDistance < proximityThreshold
          ? closestLinePointStroke.selected
          : closestLinePointStroke.unselected
      );
    }
  }
  function updateClosestLinePointTransform(
    el: SVGElement | undefined | null,
    state: RenderState,
    slowState: SlowState
  ) {
    if (el && state.closestLinePoint && slowState.hasClosestLine) {
      el.setAttribute('transform', `translate(${state.closestLinePoint[0]}, ${state.closestLinePoint[1]})`);

      // el.setAttribute('cx', '' + state.closestLinePoint[0]);
      // el.setAttribute('cy', '' + state.closestLinePoint[1]);
      // el.setAttribute(
      //   'fill',
      //   state.closestLineDistance < proximityThreshold ? closestLinePointFill.selected : closestLinePointFill.unselected
      // );
      // el.setAttribute(
      //   'stroke',
      //   state.closestLineDistance < proximityThreshold
      //     ? closestLinePointStroke.selected
      //     : closestLinePointStroke.unselected
      // );
    }
  }

  function updateSelectBox(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.selectionBox && slowState.transitionIntentType === 'select-multiple-points') {
      el.setAttribute('x', '' + state.selectionBox.x);
      el.setAttribute('y', '' + state.selectionBox.y);
      el.setAttribute('width', '' + state.selectionBox.width);
      el.setAttribute('height', '' + state.selectionBox.height);
    }
  }

  function updatePointLine(el: SVGElement | undefined | null, state: RenderState, slowState: SlowState) {
    if (el && state.pointer && state.selectedPoints.length) {
      if (slowState.actionIntentType === 'close-shape' || slowState.actionIntentType === 'close-shape-line') {
        const firstPoint = state.polygon.points[0];
        const lastPoint = state.polygon.points[state.polygon.points.length - 1];
        if (firstPoint && lastPoint) {
          el.setAttribute('points', `${firstPoint.join(',')} ${lastPoint.join(',')}`);
        }
      } else {
        if (state.line) {
          el.setAttribute('points', `${state.line[0].join(',')} ${state.line[1].join(',')}`);
        } else {
          const first = state.polygon.points[state.selectedPoints[0]];
          if (first && first.length) {
            el.setAttribute('points', `${state.pointer[0]},${state.pointer[1]} ${first.join(',')}`);
          }
        }
      }
    }
  }

  function updateDrawPreview(
    el: SVGElement | undefined | null,
    state: RenderState,
    slowState: SlowState,
    tolerance = 3
  ) {
    if (el && state.transitionDraw.length) {
      el.setAttribute(
        'points',
        simplifyPolygon(state.transitionDraw, tolerance * 3)
          .map((p) => p.join(','))
          .join(' ')
      );
    }
  }

  return {
    updateTransitionBoundingBox,
    updateClosestLinePointTransform,
    updateBoundingBoxPolygon,
    updateBoundingBox,
    updateTransitionShape,
    updateClosestLinePoint,
    updateSelectBox,
    updatePointLine,
    updateDrawPreview,
  };
}
