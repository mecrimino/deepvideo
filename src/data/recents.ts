/** "Recent Generations" cards on Home — verbatim from the design file. */

export interface RecentGeneration {
  title: string;
  dur: string;
  tag: string;
  meta: string;
}

export const recents: RecentGeneration[] = [
  { title: 'The Lost City of Atlantis', dur: '2:14', tag: 'DOCUMENTARY', meta: 'Deep Video v1 Pro · 3d ago' },
  { title: 'Top 10 Deep Sea Creatures', dur: '3:41', tag: 'TOP 10', meta: 'Deep Video v1 Pro · 5d ago' },
  { title: 'How Black Holes Form', dur: '1:58', tag: 'EXPLAINER', meta: 'Deep Video v1 Mini · 1w ago' },
  { title: 'The Cold War in 5 Minutes', dur: '5:02', tag: 'HISTORY', meta: 'Deep Video v1 Pro · 2w ago' },
];
