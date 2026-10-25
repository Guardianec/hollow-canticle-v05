export const GRAPHICS_LEVELS = ['very-low', 'low', 'medium', 'high', 'extreme'] as const;
export type GraphicsLevel = (typeof GRAPHICS_LEVELS)[number];
export interface GraphicsProfile {
  label: string;
  pixelRatio: number;
  shadowSize: number;
  maxLights: number;
  particles: number;
  fogLayers: number;
  highTextures: boolean;
  lod: [number, number];
  bloom: number;
  decals: boolean;
  background: boolean;
  drawDistance: number;
}
export const GRAPHICS: Record<GraphicsLevel, GraphicsProfile> = {
  'very-low': {
    label: 'Very Low',
    pixelRatio: 0.6,
    shadowSize: 0,
    maxLights: 1,
    particles: 0.25,
    fogLayers: 0,
    highTextures: false,
    lod: [8, 18],
    bloom: 0,
    decals: false,
    background: false,
    drawDistance: 65,
  },
  low: {
    label: 'Low',
    pixelRatio: 0.8,
    shadowSize: 0,
    maxLights: 2,
    particles: 0.45,
    fogLayers: 1,
    highTextures: false,
    lod: [16, 40],
    bloom: 0,
    decals: false,
    background: true,
    drawDistance: 90,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1,
    shadowSize: 1024,
    maxLights: 3,
    particles: 0.7,
    fogLayers: 2,
    highTextures: false,
    lod: [22, 50],
    bloom: 0.1,
    decals: true,
    background: true,
    drawDistance: 120,
  },
  high: {
    label: 'High',
    pixelRatio: 1.5,
    shadowSize: 2048,
    maxLights: 5,
    particles: 1,
    fogLayers: 3,
    highTextures: true,
    lod: [32, 65],
    bloom: 0.16,
    decals: true,
    background: true,
    drawDistance: 160,
  },
  extreme: {
    label: 'Extreme',
    pixelRatio: 2,
    shadowSize: 4096,
    maxLights: 6,
    particles: 1.6,
    fogLayers: 3,
    highTextures: true,
    lod: [48, 95],
    bloom: 0.22,
    decals: true,
    background: true,
    drawDistance: 210,
  },
};
export function graphicsLevel(value: unknown, legacyQuality = true): GraphicsLevel {
  return GRAPHICS_LEVELS.includes(value as GraphicsLevel)
    ? (value as GraphicsLevel)
    : legacyQuality
      ? 'high'
      : 'low';
}
