import { useState } from 'react';
import type { InputShape, ValidTools } from 'polygons-core';
import { PolygonEditor } from './PolygonEditor';

function box(id: string, x: number, y: number, width: number, height: number): InputShape {
  return {
    id,
    open: false,
    points: [
      [x, y],
      [x, y + height],
      [x + width, y + height],
      [x + width, y],
    ],
  };
}
function initialBoxes() {
  const boxes: InputShape[] = [];
  for (let row = 0; row < 5; row++)
    for (let column = 0; column < 8; column++) {
      boxes.push(
        box(
          `Box ${boxes.length + 1}`,
          35 + column * 118,
          35 + row * 100,
          72 + ((row + column) % 3) * 10,
          54 + (column % 2) * 12
        )
      );
    }
  boxes.push(box('Working box', 720, 545, 120, 70));
  return boxes;
}
export function AnnotationWorkbench() {
  const [boxes, setBoxes] = useState(initialBoxes);
  const [active, setActive] = useState('Working box');
  const [tool, setTool] = useState<ValidTools>('pointer');
  const selected = boxes.find((b) => b.id === active) ?? boxes[boxes.length - 1];
  const others = boxes.filter((b) => b.id !== selected.id);
  // Drop an abandoned, still-empty "New box" when the user moves to another annotation.
  function activate(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id === id || b.points.length > 0));
    setActive(id);
  }
  return (
    <>
      <div className="workbench-toolbar">
        <span>
          <strong>{boxes.length} annotations</strong> · editing {selected.id}
        </span>
        <button
          onClick={() => {
            const id = `New box ${boxes.length + 1}`;
            setBoxes((prev) => [...prev, { id, open: false, points: [] }]);
            setActive(id);
            setTool('box');
          }}
        >
          Add box
        </button>
        <button onClick={() => setTool('pointer')}>Select boxes</button>
        <button
          onClick={() => {
            setBoxes(initialBoxes());
            setActive('Working box');
            setTool('pointer');
          }}
        >
          Reset scene
        </button>
      </div>
      <PolygonEditor
        selectWholeShape
        canDeselect={false}
        shape={selected}
        tool={tool}
        snapping
        bounds
        snapSources={others}
        viewBox={{ x: 0, y: 0, width: 1000, height: 650 }}
        title="Align a page of annotations."
        description="A crowded scene for testing vertices, edges, alignment guides, and bounding-box movement. Every box can be selected and edited."
        instructions={[
          'Drag the working box toward another box and watch its corners and edges snap.',
          'Choose pointer, then click any grey box to edit that annotation.',
          'Add a box in a gap. Resize its square handles; hold Shift to preserve its proportions.',
        ]}
        inspectorOpen={false}
        onSourceSelect={(index) => {
          activate(others[index].id!);
          setTool('pointer');
        }}
        onChange={(shape) => setBoxes((prev) => prev.map((b) => (b.id === selected.id ? { ...shape, id: selected.id } : b)))}
      />
    </>
  );
}
