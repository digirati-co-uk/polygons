import { InputShape } from 'polygons-core';

export type ShapeState = {
  shapes: Array<InputShape>;
  selectedShape: number | null;
};

export type ShapeActions =
  | { type: 'add-shape' }
  | { type: 'update-current-shape'; shape: InputShape }
  | { type: 'remove-shape' }
  | { type: 'select-shape'; idx: number }
  | { type: 'deselect-shape' };

export function shapeReducer(state: ShapeState, action: ShapeActions): ShapeState {
  switch (action.type) {
    case 'add-shape':
      return {
        ...state,
        shapes: [
          ...state.shapes,
          {
            id: `shape-${Math.round(Math.random() * 1000000)}`,
            points: [],
            open: true,
          },
        ],
        selectedShape: state.shapes.length,
      };
    case 'update-current-shape':
      return {
        ...state,
        shapes: state.shapes.map((shape, idx) => {
          if (idx === state.selectedShape) {
            return action.shape;
          }
          return shape;
        }),
      };
    case 'remove-shape':
      return {
        ...state,
        shapes: state.shapes.filter((_, idx) => idx !== state.selectedShape),
        selectedShape: null,
      };
    case 'select-shape':
      return {
        ...state,
        selectedShape: action.idx,
      };
    case 'deselect-shape':
      return {
        ...state,
        selectedShape: null,
      };
  }
}
