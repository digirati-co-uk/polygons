import type { Preview } from '@storybook/react-vite';
import '../src/style.css';
const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    options: { storySort: { order: ['Start here', 'Scenarios', 'Checks'] } },
  },
};
export default preview;
