import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolygonEditor } from './PolygonEditor';

const meta = {
  title: 'Scenarios/Draw and edit',
  component: PolygonEditor,
  tags: ['showcase', 'autodocs'],
  args: { inspectorOpen: false },
  parameters: {
    docs: {
      description: {
        component:
          'Hands-on starting points. These stories do not run an interaction script when opened: try the steps, explore the controls, and reset the story to begin again. Automated regression stories live under Checks.',
      },
    },
  },
} satisfies Meta<typeof PolygonEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CloseAPolygon: Story = {
  name: 'Close a polygon',
  args: {
    tool: 'pen',
    shape: {
      open: true,
      points: [
        [120, 100],
        [360, 110],
        [300, 300],
      ],
    },
    title: 'See exactly when a polygon will close.',
    description:
      'Continue an open outline or return to its first endpoint. The filled preview, target ring, and cursor announce closure before you click.',
    instructions: [
      'Move over the first point at the upper left. Look for the green closing preview and the highlighted ring on the endpoint.',
      'Move away to continue adding points, or click the highlighted endpoint to close.',
      'Use Undo to reopen it and try closing with the Finish button instead.',
    ],
  },
};
export const ResizeABoundingBox: Story = {
  name: 'Resize a bounding box',
  args: {
    tool: 'box',
    shape: {
      open: false,
      points: [
        [120, 100],
        [120, 280],
        [380, 280],
        [380, 100],
      ],
    },
    title: 'Resize with dedicated box handles.',
    description:
      'Square purple handles and a dashed bounding box distinguish whole-shape editing from the pen’s individual vertices.',
    instructions: [
      'Move over a square corner: the cursor changes to the matching resize direction.',
      'Drag the inside of the box to move it; drag a corner to resize.',
      'Hold Shift for the aspect ratio, or Alt to resize from the centre.',
    ],
  },
};
export const SelectSeveralPoints: Story = {
  name: 'Select several points',
  args: {
    tool: 'pointer',
    shape: {
      open: false,
      points: [
        [120, 100],
        [320, 80],
        [460, 200],
        [340, 320],
        [120, 280],
      ],
    },
    title: 'Select points with a marquee.',
    description:
      'Drag across empty space to draw a blue selection rectangle, then move the selected vertices together.',
    instructions: [
      'Start in empty space above and to the left of the shape, then drag around its upper two points.',
      'Watch the blue rectangle while selecting and the filled handles after release.',
      'Drag a selected point to move the group, or use the nudge arrows.',
    ],
  },
};
export const PlaceOnAGrid: Story = {
  name: 'Place points on a grid',
  args: {
    tool: 'pen',
    snapping: true,
    grid: true,
    title: 'Preview the position that will be saved.',
    description:
      'The purple placement cross and the end of the preview line lock to the same grid intersection as the next committed point.',
    instructions: [
      'Move the pointer without clicking. The placement cross should jump between grid intersections.',
      'Place a point, then move again: the preview line and cross should end at the same snapped position.',
      'Hold Shift to suspend point and line snapping (curved edges still snap) and constrain the next line by angle.',
    ],
  },
};
export const ShapeACurve: Story = {
  name: 'Shape a Bézier curve',
  args: {
    tool: 'pointer',
    shape: {
      open: false,
      points: [
        [140, 180, 20, -120, 170, -120],
        [340, 180, 90, 25, 40, 135],
        [300, 320, -70, 20, -170, -50],
        [100, 280, -15, -50, -10, -80],
      ],
    },
    title: 'Shape the curve with its controls.',
    description:
      'Amber control handles are draggable. Their dotted arms show which endpoint they influence; the anchors keep their normal position handles.',
    instructions: [
      'Drag an amber circular control handle to change the curve without moving its anchor.',
      'Double-click an anchor that has curve handles to smoothen it, lining its two handles up.',
      'Dragging a handle swings the one on the other side of the anchor with it, keeping the point smooth. Hold Alt to move just that handle, or Shift to snap it to 15° steps.',
      'Undo and redo the edit, or drag an ordinary green anchor to move its controls with it.',
      'Select one anchor and choose Make curve to smooth it, or select two neighbouring anchors to curve the segment between them.',
    ],
  },
};
export const BendALine: Story = {
  name: 'Bend a line',
  args: {
    tool: 'pen',
    shape: {
      open: false,
      points: [
        [140, 110],
        [400, 110],
        [400, 300],
        [140, 300],
      ],
    },
    title: 'Drag a line into a curve.',
    description:
      'Dragging out of a line adds a point. Hold Alt (Option) and the same drag bends the line instead, pulling both control handles out so the curve follows your pointer.',
    instructions: [
      'Hover a side: a crosshair shows where a new point would go. Drag to add it.',
      'Hold Alt before or during the drag to bend the line instead; release Alt to switch back to adding a point.',
      'Grab the curved line again to keep bending it, or use Undo to return to the straight edge.',
    ],
  },
};
export const SnapToCurves: Story = {
  name: 'Snap to curves',
  args: {
    tool: 'pen',
    snapping: true,
    shape: { open: true, points: [] },
    snapSources: [
      {
        id: 'Arch',
        open: false,
        points: [
          [120, 300, 0, -220, 300, -220],
          [420, 300],
        ],
      },
    ],
    title: 'Snap to curved edges.',
    description:
      'Curved (Bézier) edges of other shapes attract the pointer just like straight ones, and the snap guide traces the curve. Turn it off under Settings → Snap to curves.',
    instructions: [
      'Move the pen near the grey arch: the pointer jumps onto the curve and the curve highlights.',
      'Place a point on it, then add more and close the shape against the curve.',
      'Open Settings and untick Snap to curves to compare with plain point snapping. Holding Shift snaps to curves only, even with snapping off.',
    ],
  },
};
export const PlaceABoxOnTouch: Story = {
  name: 'Place a box on a phone',
  args: {
    tool: 'box',
    touch: true,
    boxPlacement: 'tap',
    width: 390,
    viewBox: { x: 0, y: 0, width: 600, height: 600 },
    title: 'Place a box with two taps.',
    description: 'The first tap starts a draft. The second commits the box and exposes its editing handles.',
    instructions: [
      'Tap the first corner, then tap the opposite corner.',
      'Try Cancel gesture after the first tap; it should leave no saved box.',
      'Drag the square handles after placing it. Touch targets stay large at this zoom.',
    ],
  },
};
export const PreciseReticlePlacement: Story = {
  name: 'Place points with a reticle',
  args: {
    tool: 'pen',
    touch: true,
    reticle: true,
    width: 390,
    title: 'Bring the image under the crosshair.',
    description: 'The host controls the view while the editor places points at the reticle’s world position.',
    instructions: [
      'Choose Add point to place the first vertex.',
      'Use Pan right or Pan down, then Add point again.',
      'Undo point removes the active endpoint without leaving drawing mode.',
    ],
  },
};
