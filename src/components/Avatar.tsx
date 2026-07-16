import { gradients } from '../theme';

/** Round gradient avatar chip. */
export function Avatar({
  size = 34,
  gradient = gradients.avatar,
  border,
  style,
}: {
  size?: number;
  gradient?: string;
  border?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: gradient,
        display: 'inline-block',
        flexShrink: 0,
        border,
        ...style,
      }}
    />
  );
}
