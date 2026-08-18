// Icônes du journal d'activité (design_handoff_restyle) - un événement SSE
// inconnu retombe sur le point neutre plutôt que de ne rien afficher.
export function ActivityIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'route':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
          <circle cx="9" cy="9" r="7" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
          <rect x="7.2" y="7.2" width="3.6" height="3.6" fill="var(--accent)" transform="rotate(45 9 9)" />
        </svg>
      );
    case 'search':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
          <circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
          <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'followRenvois':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
          <path
            d="M9 2 L9 16 M2 9 L16 9"
            stroke="var(--ref-cross-code)"
            strokeWidth="1.6"
            transform="rotate(45 9 9)"
          />
        </svg>
      );
    case 'draft':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
          <polyline
            points="3,9.5 7,13.5 15,4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
          <circle cx="9" cy="9" r="3" fill="currentColor" />
        </svg>
      );
  }
}
