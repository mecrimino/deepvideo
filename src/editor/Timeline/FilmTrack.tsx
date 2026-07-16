import { film } from '../../data/timeline-mock';
import { ClipBlock } from '../ClipBlock/ClipBlock';

/** Film-strip video track. */
export function FilmTrack() {
  return (
    <div style={{ display: 'flex', gap: 2, height: 42 }}>
      {film.map((cell, i) => (
        <ClipBlock key={i} cell={cell} />
      ))}
    </div>
  );
}
