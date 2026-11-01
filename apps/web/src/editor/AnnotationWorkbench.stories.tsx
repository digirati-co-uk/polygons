import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnnotationWorkbench } from './AnnotationWorkbench';
const meta = {
  title: 'Scenarios/Many boxes',
  component: AnnotationWorkbench,
  tags: ['showcase', 'autodocs'],
} satisfies Meta<typeof AnnotationWorkbench>;
export default meta;
export const DenseAnnotationPage: StoryObj<typeof meta> = { name: 'Align, resize, and add boxes' };
