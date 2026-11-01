import type { Meta, StoryObj } from '@storybook/react-vite';
import { AtlasExample } from './AtlasExample';
const meta = {
  title: 'Scenarios/IIIF deep zoom',
  component: AtlasExample,
  tags: ['showcase', '!test', 'autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Live IIIF image services with tiled deep zoom. These user-facing stories use the real Bodleian and Wellcome services; deterministic Atlas regression stories live under Checks. Live service validation is available with pnpm test:iiif.',
      },
    },
  },
} satisfies Meta<typeof AtlasExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BodleianScan: Story = { name: 'Bodleian · annotate a detail', args: { image: 'bodleian' } };
export const WellcomePage: Story = { name: 'Wellcome · trace a digitised page', args: { image: 'wellcome' } };
