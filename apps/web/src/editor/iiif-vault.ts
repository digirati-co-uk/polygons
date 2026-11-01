import { Vault } from '@iiif/helpers';

// Atlas' ImageService adapter shares the host's IIIF vault. Reuse an existing
// host vault, and provide one for standalone Storybook/example environments.
const host = globalThis as typeof globalThis & { IIIF_VAULT?: Vault };
host.IIIF_VAULT ||= new Vault();
