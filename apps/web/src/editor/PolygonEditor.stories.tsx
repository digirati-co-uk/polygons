import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { PolygonEditor } from './PolygonEditor';
import type { Point } from 'polygons-core';

const triangle = {
  open: false,
  points: [
    [100, 100],
    [300, 100],
    [200, 300],
  ] as Point[],
};
const rectangle = {
  open: false,
  points: [
    [100, 100],
    [100, 240],
    [320, 240],
    [320, 100],
  ] as Point[],
};
const meta = {
  id: 'editor-polygons',
  title: 'Checks/Editor',
  component: PolygonEditor,
  tags: ['autodocs'],
  args: {
    tool: 'pen',
    touch: false,
    boxPlacement: 'drag',
    snapping: false,
    grid: false,
    bounds: false,
    reticle: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'The same typed, event-driven React integration powers the playground and these browser tests. Points are canvas-local world coordinates; thresholds and offsets are CSS pixels. The inspector distinguishes drafts from saved geometry.',
      },
    },
  },
} satisfies Meta<typeof PolygonEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

function read(canvas: HTMLElement, name = 'shape-state') {
  return JSON.parse(within(canvas).getByTestId(name).textContent || '{}', (_key, value) =>
    typeof value === 'number' ? Math.round(value * 1e8) / 1e8 : value
  );
}
function surface(canvas: HTMLElement) {
  return within(canvas).getByRole('application') as unknown as SVGSVGElement;
}
function send(
  canvas: HTMLElement,
  type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  point: Point,
  pointerId = 1,
  pointerType = 'mouse'
) {
  const el = surface(canvas);
  const client = new DOMPoint(point[0], point[1]).matrixTransform(el.getScreenCTM()!);
  fireEvent[type](el, {
    clientX: client.x,
    clientY: client.y,
    pointerId,
    pointerType,
    button: 0,
    buttons: type === 'pointerUp' || type === 'pointerCancel' ? 0 : 1,
    isPrimary: pointerId === 1,
  });
}
async function tap(canvas: HTMLElement, point: Point, pointerType = 'mouse') {
  send(canvas, 'pointerDown', point, 1, pointerType);
  send(canvas, 'pointerUp', point, 1, pointerType);
  await waitFor(() => expect(read(canvas, 'interaction-state').transitioning).toBe(false));
}
async function drag(canvas: HTMLElement, from: Point, to: Point) {
  send(canvas, 'pointerDown', from);
  send(canvas, 'pointerMove', to);
  send(canvas, 'pointerUp', to);
  await waitFor(() => expect(read(canvas, 'interaction-state').transitioning).toBe(false));
}

export const Playground: Story = {};
export const ColdTapAndExplicitFinish: Story = {
  play: async ({ canvasElement: c }) => {
    await tap(c, [100, 100]);
    await tap(c, [300, 100]);
    await tap(c, [200, 300]);
    await expect(read(c).points).toHaveLength(3);
    await userEvent.click(within(c).getByRole('button', { name: 'Finish' }));
    await expect(read(c).open).toBe(false);
    await expect(read(c, 'saved-state').points).toHaveLength(3);
  },
};
export const FastDragRelease: Story = {
  args: { shape: triangle, tool: 'pointer' },
  play: async ({ canvasElement: c }) => {
    await drag(c, [100, 100], [150, 150]);
    await expect(read(c).points[0]).toEqual([150, 150]);
  },
};
export const ReleaseEndpoint: Story = {
  args: { shape: triangle, tool: 'pointer' },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [100, 100]);
    send(c, 'pointerUp', [160, 145]);
    await waitFor(() => expect(read(c).points[0]).toEqual([160, 145]));
  },
};
export const UndoRedoAndBranch: Story = {
  args: { shape: triangle, tool: 'pointer' },
  play: async ({ canvasElement: c }) => {
    const ui = within(c);
    await drag(c, [100, 100], [150, 150]);
    await userEvent.click(ui.getByRole('button', { name: 'Undo' }));
    await expect(read(c).points).toEqual(triangle.points);
    await userEvent.click(ui.getByRole('button', { name: 'Redo' }));
    await expect(read(c).points[0]).toEqual([150, 150]);
    await userEvent.click(ui.getByRole('button', { name: 'Undo' }));
    await drag(c, [100, 100], [130, 160]);
    await expect(ui.getByRole('button', { name: 'Redo' })).toBeDisabled();
  },
};
export const DragBox: Story = {
  args: { tool: 'box' },
  play: async ({ canvasElement: c }) => {
    await drag(c, [100, 100], [320, 240]);
    await expect(read(c).points).toEqual(rectangle.points);
  },
};
export const TouchTapBox: Story = {
  args: { tool: 'box', touch: true, boxPlacement: 'tap', width: 360, viewBox: { x: 0, y: 0, width: 600, height: 600 } },
  play: async ({ canvasElement: c }) => {
    await tap(c, [100, 100], 'touch');
    await expect(read(c).points).toEqual([]);
    await expect(read(c, 'interaction-state').pending).toBe(true);
    await tap(c, [320, 240], 'touch');
    await expect(read(c).points).toEqual(rectangle.points);
    await expect(read(c, 'interaction-state').tool).toBe('pointer');
  },
};
export const CancelCreation: Story = {
  args: { tool: 'box' },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [100, 100]);
    send(c, 'pointerMove', [320, 240]);
    await waitFor(() => expect(within(c).getByTestId('draft-shape')).toBeVisible());
    await expect(read(c, 'saved-state').points).toEqual([]);
    send(c, 'pointerCancel', [320, 240]);
    await waitFor(() => expect(within(c).queryByTestId('draft-shape')).toBeNull());
    await expect(read(c).points).toEqual([]);
  },
};
export const LostCaptureBeforeDrag: Story = {
  args: { tool: 'box' },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [100, 100]);
    fireEvent.lostPointerCapture(surface(c), { pointerId: 1 });
    send(c, 'pointerMove', [320, 240]);
    send(c, 'pointerUp', [320, 240]);
    await expect(read(c).points).toEqual([]);
    await drag(c, [100, 100], [320, 240]);
    await expect(read(c).points).toEqual(rectangle.points);
  },
};
export const BlurBeforeDrag: Story = {
  args: { tool: 'box' },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [100, 100]);
    surface(c).blur();
    send(c, 'pointerMove', [320, 240]);
    send(c, 'pointerUp', [320, 240]);
    await expect(read(c).points).toEqual([]);
  },
};
export const SecondFingerCancels: Story = {
  args: { shape: triangle, tool: 'pointer', touch: true, width: 360 },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [100, 100], 1, 'touch');
    send(c, 'pointerMove', [150, 150], 1, 'touch');
    send(c, 'pointerDown', [300, 250], 2, 'touch');
    send(c, 'pointerUp', [300, 250], 2, 'touch');
    send(c, 'pointerMove', [180, 180], 1, 'touch');
    send(c, 'pointerUp', [180, 180], 1, 'touch');
    await waitFor(() => expect(read(c).points).toEqual(triangle.points));
    await expect(read(c, 'interaction-state').transitioning).toBe(false);
  },
};
export const SnapGrabOffset: Story = {
  args: {
    shape: {
      open: false,
      points: [
        [100, 100],
        [200, 100],
        [250, 260],
      ],
    },
    tool: 'pointer',
    snapping: true,
    width: 600,
  },
  play: async ({ canvasElement: c }) => {
    await drag(c, [105, 105], [198, 102]);
    await expect(read(c).points[0], JSON.stringify(read(c, 'interaction-state'))).toEqual([200, 100]);
  },
};
export const GridAndExternalTargets: Story = {
  args: {
    snapping: true,
    grid: true,
    snapSources: [
      {
        open: true,
        points: [
          [180, 160],
          [420, 160],
        ],
      },
    ],
  },
  play: async ({ canvasElement: c }) => {
    await tap(c, [184, 164]);
    await waitFor(() => expect(read(c).points[0]).toEqual([180, 160]));
  },
};
export const TouchTargetsAtZoom: Story = {
  args: { shape: triangle, tool: 'pointer', touch: true, width: 360 },
  play: async ({ canvasElement: c }) => {
    await tap(c, [125, 100], 'touch');
    await waitFor(() => expect(read(c, 'interaction-state').selected).toEqual([0]));
    await expect(read(c, 'interaction-state').proximity / read(c, 'interaction-state').scale).toBeCloseTo(22);
  },
};
export const ReticlePlacement: Story = {
  args: { touch: true, reticle: true, width: 360 },
  play: async ({ canvasElement: c }) => {
    const ui = within(c);
    await userEvent.click(ui.getByRole('button', { name: 'Add point' }));
    await expect(read(c).points).toEqual([[300, 200]]);
    await userEvent.click(ui.getByRole('button', { name: 'Pan right' }));
    await userEvent.click(ui.getByRole('button', { name: 'Add point' }));
    await expect(read(c).points).toEqual([
      [320, 200],
      [300, 200],
    ]);
    await userEvent.click(ui.getByRole('button', { name: 'Undo point' }));
    await expect(read(c).points).toEqual([[300, 200]]);
  },
};
export const OffsetHandle: Story = {
  args: { shape: triangle, tool: 'pointer', touch: true, dragOffset: [0, -40] },
  play: async ({ canvasElement: c }) => {
    await drag(c, [100, 100], [150, 180]);
    const scale = read(c, 'interaction-state').scale;
    await expect(read(c).points[0][0]).toBeCloseTo(150);
    await expect(read(c).points[0][1]).toBeCloseTo(180 - 40 * scale);
  },
};
export const CanvasLocalCoordinates: Story = {
  args: { tool: 'box', viewBox: { x: 800, y: 500, width: 600, height: 400 } },
  play: async ({ canvasElement: c }) => {
    await drag(c, [900, 600], [1100, 740]);
    await expect(read(c).points).toEqual([
      [900, 600],
      [900, 740],
      [1100, 740],
      [1100, 600],
    ]);
  },
};
export const BoundsAndResize: Story = {
  args: { shape: rectangle, tool: 'box', bounds: true },
  play: async ({ canvasElement: c }) => {
    await drag(c, [320, 240], [750, 500]);
    const points = read(c).points;
    await expect(points.every((p: number[]) => p[0] >= 0 && p[0] <= 600 && p[1] >= 0 && p[1] <= 400)).toBe(true);
  },
};
export const DegenerateGeometry: Story = {
  args: {
    shape: {
      open: false,
      points: [
        [100, 100],
        [100, 150],
        [100, 200],
        [100, 250],
      ],
    },
    tool: 'pointer',
  },
  play: async ({ canvasElement: c }) => {
    await drag(c, [100, 100], [150, 50]);
    await expect(read(c).points.every((p: number[]) => p.every(Number.isFinite))).toBe(true);
  },
};
export const BezierDataSurvivesNudge: Story = {
  args: {
    shape: {
      open: true,
      points: [
        [100, 100, 40, -50, 80, 50],
        [240, 100],
        [300, 240],
      ],
    },
    tool: 'pointer',
  },
  play: async ({ canvasElement: c }) => {
    await tap(c, [100, 100]);
    await userEvent.click(within(c).getByRole('button', { name: 'Nudge →' }));
    const [x, y, c1x, c1y, c2x, c2y] = read(c).points[0];
    await expect(x).toBeGreaterThan(100);
    // The outgoing handle travels with the nudged point; the second handle belongs to the next point,
    // which did not move, so it stays where it was (180, 150).
    await expect([c1x, c1y]).toEqual([40, -50]);
    await expect(x + c2x).toBeCloseTo(180);
    await expect(y + c2y).toBeCloseTo(150);
  },
};

export const GridPlacement: Story = {
  args: { snapping: true, grid: true },
  play: async ({ canvasElement: c }) => {
    await tap(c, [182, 163]);
    await expect(read(c).points).toEqual([[180, 160]]);
  },
};
export const LineBoxWorkflow: Story = {
  args: { tool: 'lineBox' },
  play: async ({ canvasElement: c }) => {
    await tap(c, [100, 100]);
    await tap(c, [300, 100]);
    await tap(c, [200, 200]);
    await expect(read(c).points).toHaveLength(4);
    await expect(read(c).open).toBe(false);
  },
};
export const WholeShapeSnapping: Story = {
  args: {
    shape: {
      open: false,
      points: [
        [100, 100],
        [100, 200],
        [200, 200],
        [200, 100],
      ],
    },
    tool: 'hand',
    snapping: true,
    snapSources: [{ open: true, points: [[250, 250]] }],
    width: 600,
  },
  play: async ({ canvasElement: c }) => {
    await drag(c, [150, 150], [198, 198]);
    await expect(read(c).points[2]).toEqual([250, 250]);
  },
};

export const FixedRatioAtBoundary: Story = {
  args: { shape: rectangle, tool: 'box', bounds: true, fixedAspectRatio: true },
  play: async ({ canvasElement: c }) => {
    await drag(c, [320, 240], [750, 500]);
    const p = read(c).points;
    const width = Math.max(...p.map((v: number[]) => v[0])) - Math.min(...p.map((v: number[]) => v[0]));
    const height = Math.max(...p.map((v: number[]) => v[1])) - Math.min(...p.map((v: number[]) => v[1]));
    await expect(width / height).toBeCloseTo(220 / 140);
    await expect(p.every((v: number[]) => v[0] <= 600 && v[1] <= 400)).toBe(true);
  },
};

export const VisibleClosureFeedback: Story = {
  args: {
    shape: {
      open: true,
      points: [
        [100, 100],
        [300, 100],
        [200, 300],
      ],
    },
    tool: 'pen',
  },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerMove', [103, 103]);
    await waitFor(() => expect(within(c).getByTestId('close-preview')).toBeVisible());
    await expect(surface(c).style.cursor).toBe('pointer');
    await expect(within(c).getByTestId('close-target')).toBeVisible();
    await tap(c, [103, 103]);
    await expect(read(c).open).toBe(false);
  },
};
export const GridPreviewBeforeClick: Story = {
  args: { snapping: true, grid: true },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerMove', [182, 163]);
    await waitFor(() => expect(within(c).getByTestId('placement-preview')).toHaveAttribute('data-x', '180'));
    await expect(within(c).getByTestId('placement-preview')).toHaveAttribute('data-y', '160');
    await tap(c, [182, 163]);
    await expect(read(c).points[0]).toEqual([180, 160]);
    send(c, 'pointerMove', [262, 243]);
    await waitFor(() => expect(within(c).getByTestId('placement-preview')).toHaveAttribute('data-x', '260'));
  },
};
export const StyledSelectionMarquee: Story = {
  args: { shape: triangle, tool: 'pointer' },
  play: async ({ canvasElement: c }) => {
    send(c, 'pointerDown', [60, 60]);
    send(c, 'pointerMove', [350, 150]);
    await waitFor(() => expect(within(c).getByTestId('selection-marquee')).toHaveAttribute('stroke', '#356fbd'));
    send(c, 'pointerUp', [350, 150]);
    await waitFor(() => expect(read(c, 'interaction-state').selected).toEqual([0, 1]));
  },
};
export const DistinctBoundingBoxHandles: Story = {
  args: { shape: rectangle, tool: 'box' },
  play: async ({ canvasElement: c }) => {
    await expect(within(c).getAllByTestId('bounding-box-handle')).toHaveLength(4);
    send(c, 'pointerMove', [320, 240]);
    await waitFor(() => expect(surface(c).style.cursor).toBe('nwse-resize'));
  },
};
export const EditBezierControls: Story = {
  args: {
    shape: {
      open: true,
      points: [
        [100, 150, 40, -70, 120, -70],
        [300, 150],
        [350, 300],
      ],
    },
    tool: 'pointer',
  },
  play: async ({ canvasElement: c }) => {
    await expect(within(c).getAllByTestId('bezier-controls')).toHaveLength(1);
    send(c, 'pointerMove', [140, 80]);
    await waitFor(() => expect(surface(c).style.cursor).toBe('grab'));
    await drag(c, [140, 80], [160, 40]);
    await expect(read(c).points[0]).toEqual([100, 150, 60, -110, 120, -70]);
    await userEvent.click(within(c).getByRole('button', { name: 'Undo' }));
    await expect(read(c).points[0]).toEqual([100, 150, 40, -70, 120, -70]);
  },
};
