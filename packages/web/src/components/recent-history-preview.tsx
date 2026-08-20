'use client';

import { useEffect, useState } from 'react';
import { type HistoryEntry, listHistoryEntries } from '../lib/history';
import { formatConfianceBadge } from '../lib/format';

const RECENT_PREVIEW_LIMIT = 3;

export function RecentHistoryPreview() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(listHistoryEntries().slice(0, RECENT_PREVIEW_LIMIT));
  }, []);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="recent-history">
      <p className="recent-history-label">Historique</p>
      <ul className="recent-history-list">
        {entries.map((entry) => {
          const badge = formatConfianceBadge(entry.reponse.confiance);
          return (
            <li key={entry.id}>
              <a href={`/historique/${encodeURIComponent(entry.id)}`} className="recent-history-item">
                <span className="recent-history-question">{entry.question}</span>
                <span className={`badge ${badge.className}`}>{badge.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <a href="/historique" className="recent-history-more">
        Tout voir →
      </a>
    </div>
  );
}
