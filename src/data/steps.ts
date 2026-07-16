/** Processing-screen steps with pulse delays — verbatim from the design file. */

export interface ProcessingStep {
  label: string;
  delay: string;
}

export const steps: ProcessingStep[] = [
  { label: 'Analyzing prompt & intent', delay: '0s' },
  { label: 'Researching sources', delay: '.2s' },
  { label: 'Writing the script', delay: '.4s' },
  { label: 'Selecting motion templates', delay: '.6s' },
  { label: 'Assembling the timeline', delay: '.8s' },
];
