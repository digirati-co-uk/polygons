export const iiifImages = {
  bodleian: {
    label: 'Bodleian Library · high-resolution scan',
    info: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
    credit: 'Image served by the Bodleian Libraries IIIF service.',
  },
  wellcome: {
    label: 'Wellcome Collection · digitised page',
    info: 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/info.json',
    width: 2569,
    height: 3543,
    credit: 'Image served by the Wellcome Collection IIIF service.',
  },
} as const;
export type IIIFImage = keyof typeof iiifImages;
