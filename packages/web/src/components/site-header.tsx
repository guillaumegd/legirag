'use client';

import { usePathname } from 'next/navigation';
import { ClockIcon } from './clock-icon';

export function SiteHeader() {
  const pathname = usePathname();
  const isHistorique = pathname === '/historique';

  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand" href="/">
          <span className="brand-mark">§</span>
          legirag
        </a>
        <a
          className={`historique-link${isHistorique ? ' active' : ''}`}
          href="/historique"
          aria-label="Historique"
          aria-current={isHistorique ? 'page' : undefined}
          title="Historique"
        >
          <ClockIcon />
        </a>
      </div>
    </header>
  );
}
