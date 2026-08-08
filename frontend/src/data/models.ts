/** Production models — verbatim from the design file. */

export interface ProductionModel {
  name: string;
  blurb: string;
  desc: string;
  popular: boolean;
}

export const models: ProductionModel[] = [
  {
    name: 'Agent v1',
    blurb: 'Fully autonomous — one engine that drives every agent end-to-end.',
    desc: 'The autonomous studio. From a single idea Agent v1 runs the whole crew — Director, Research, Script, Scene Planner, stock + AI-generated visuals, motion graphics, audio, subtitles and a quality review — to produce a finished, sourced video with minimal input.',
    popular: false,
  },
];

export const previewFormats = ['Documentary', 'Top 10'];
