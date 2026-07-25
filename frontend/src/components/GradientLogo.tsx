import { gradients } from '../styles/theme';

/** The Deep Video brand square (orange→blue gradient). */
export function GradientLogo({ size = 24, radius = 7 }: { size?: number; radius?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: gradients.brand,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}
