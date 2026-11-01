import type { Meta, StoryObj } from '@storybook/react-vite';
function FeatureGallery() {
  const features = [
    [
      'Close a polygon',
      'See the closing edge and target before committing.',
      'scenarios-draw-and-edit--close-a-polygon',
    ],
    [
      'Bounding-box editing',
      'Resize square handles and move the entire box.',
      'scenarios-draw-and-edit--resize-a-bounding-box',
    ],
    [
      'Select several points',
      'Drag a blue marquee and edit a group of vertices.',
      'scenarios-draw-and-edit--select-several-points',
    ],
    [
      'Grid placement',
      'Compare the snapped preview with the committed point.',
      'scenarios-draw-and-edit--place-on-a-grid',
    ],
    [
      'Many annotations',
      'Align and resize a page with forty surrounding boxes.',
      'scenarios-many-boxes--dense-annotation-page',
    ],
    [
      'Bézier controls',
      'Drag curve controls, move anchors, and straighten segments.',
      'scenarios-draw-and-edit--shape-a-curve',
    ],
    [
      'Real IIIF deep zoom',
      'Zoom into a Bodleian scan and draw in image coordinates.',
      'scenarios-iiif-deep-zoom--bodleian-scan',
    ],
    [
      'Portrait touch',
      'Place a box with two taps and adjust its handles.',
      'scenarios-draw-and-edit--place-a-box-on-touch',
    ],
  ];
  return (
    <section className="feature-gallery">
      <span className="eyebrow">POLYGONS / FEATURE GUIDE</span>
      <h1>Try the editor.</h1>
      <p>
        Choose a scenario, follow its short guide, and explore. These examples start ready for you to use; they do not
        play through the feature automatically.
      </p>
      <div className="feature-grid">
        {features.map(([title, description, id]) => (
          <a key={id} href={`/?path=/story/${id}`} target="_top">
            <h2>{title}</h2>
            <p>{description}</p>
            <span>Open scenario →</span>
          </a>
        ))}
      </div>
      <p className="gallery-note">
        The Checks section contains the executable regression cases and their test results. Use the story reset button
        to restore any scenario.
      </p>
    </section>
  );
}
const meta = { title: 'Start here/Feature guide', component: FeatureGallery, tags: ['showcase'] } satisfies Meta<
  typeof FeatureGallery
>;
export default meta;
export const Explore: StoryObj<typeof meta> = {};
