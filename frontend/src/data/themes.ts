/** Motion-template themes — verbatim from the design file. */

export interface ThemeOption {
  name: string;
  desc: string;
}

export const themes: ThemeOption[] = [
  {
    name: 'Crime theme',
    desc: 'A dark and intense theme perfect for true crime, mystery, and investigative content with dramatic visual elements.',
  },
  {
    name: 'History theme',
    desc: 'A classic and timeless theme ideal for historical documentaries, educational content, and period pieces.',
  },
  {
    name: 'Modern theme',
    desc: 'A sleek and contemporary theme featuring clean lines and vibrant colors, perfect for tech, lifestyle, and business content.',
  },
  {
    name: 'Minimalist theme',
    desc: 'A clean and simple theme with subtle animations, ideal for corporate presentations, product showcases, and educational content.',
  },
  {
    name: 'Standard theme',
    desc: 'A versatile, well-balanced theme with neutral styling that adapts seamlessly to any content category.',
  },
];
