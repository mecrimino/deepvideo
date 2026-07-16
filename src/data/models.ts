/** Production models — verbatim from the design file. */

export interface ProductionModel {
  name: string;
  credits: string;
  blurb: string;
  desc: string;
  popular: boolean;
}

export const models: ProductionModel[] = [
  {
    name: 'Deep Video v1 Mini',
    credits: '40.0 Credits/min',
    blurb: 'Cinematic imagery, motion graphics, immersive visuals.',
    desc: 'An expert engine for stylized visual composition. The Mini model intelligently sequences high-quality images and dynamic motion graphics, applying smart pacing that aligns with your script for fast, high-impact output.',
    popular: false,
  },
  {
    name: 'Deep Video v1 Pro',
    credits: '55.0 Credits/min',
    blurb: 'Mixed media fusion, creator standard, all-rounder.',
    desc: 'The flagship all-rounder. Pro fuses stock footage, generated imagery, and motion graphics with narrative-aware editing — the most balanced choice for any content category.',
    popular: true,
  },
];

export const previewFormats = ['Documentary', 'Top 10'];
