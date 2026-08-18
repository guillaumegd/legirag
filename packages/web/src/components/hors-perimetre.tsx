import type { ReponseStructuree } from '@legirag/shared/schema';
import { WarningTriangleIcon } from './warning-triangle-icon';

export function HorsPerimetre({ items }: { items: ReponseStructuree['hors_perimetre'] }) {
  return (
    <section className="scope-panel" aria-label="Ce que cette réponse ne couvre pas">
      <h2>
        <WarningTriangleIcon />
        <span>Hors périmètre de cette réponse</span>
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
