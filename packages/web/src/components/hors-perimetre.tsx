import type { ReponseStructuree } from '@legirag/shared/schema';

export function HorsPerimetre({ items }: { items: ReponseStructuree['hors_perimetre'] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="hors-perimetre-panel" aria-label="Ce que cette réponse ne couvre pas">
      <h2>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="7.2" fill="none" stroke="var(--muted)" strokeWidth="1.6" />
          <path d="M9 5.5v4M9 12.3h.01" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
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
