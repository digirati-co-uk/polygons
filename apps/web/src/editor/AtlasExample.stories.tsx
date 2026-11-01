import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { AtlasExample } from './AtlasExample';
const meta = {
  id: 'integration-atlas',
  title: 'Checks/Atlas',
  args: { image: 'none' },
  component: AtlasExample,
  tags: ['autodocs'],
} satisfies Meta<typeof AtlasExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CanvasOrigin: Story = {};
export const OffsetCanvas: Story = { args: { canvasX: 800, canvasY: 500 } };
export const ViewerInput: Story = {
  play: async ({ canvasElement: c }) => {
    await waitFor(() => expect(within(c).getByTestId('atlas-stage')).toHaveAttribute('data-ready', 'true'));
    await waitFor(() => expect(c.querySelector('canvas')?.getBoundingClientRect().width).toBeGreaterThan(0));
    const canvas = c.querySelector('canvas')!;
    const overlay = await within(c).findByLabelText('Atlas polygon overlay');
    const rect = overlay.getBoundingClientRect();
    fireEvent.mouseDown(canvas, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.mouseUp(canvas, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: 'mouse',
    });
    await waitFor(() =>
      expect(JSON.parse(within(c).getByTestId('atlas-shape').textContent || '{}').points).toHaveLength(1)
    );
  },
};
