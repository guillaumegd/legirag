'use client';

import { useEffect, useState } from 'react';
import { type HistoryEntry, clearHistory, listHistoryEntries, removeHistoryEntry } from '../lib/history';
import { formatConfianceBadge, formatDateTimeFr } from '../lib/format';

type Confirm = { kind: 'all' } | { kind: 'one'; id: string; question: string };

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[] | undefined>(undefined);
  const [openMenuId, setOpenMenuId] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<Confirm | undefined>(undefined);

  useEffect(() => {
    setEntries(listHistoryEntries());
  }, []);

  function requestRemove(id: string, question: string) {
    setConfirm({ kind: 'one', id, question });
    setOpenMenuId(undefined);
  }

  function requestClearAll() {
    setConfirm({ kind: 'all' });
  }

  function cancelConfirm() {
    setConfirm(undefined);
  }

  function confirmDelete() {
    if (confirm === undefined) {
      return;
    }
    if (confirm.kind === 'all') {
      clearHistory();
      setEntries([]);
    } else {
      removeHistoryEntry(confirm.id);
      setEntries(listHistoryEntries());
    }
    setConfirm(undefined);
  }

  if (entries === undefined) {
    return null;
  }

  const title = (
    <div className="history-title-row">
      <h1 className="page-title">Historique</h1>
      {entries.length > 0 && (
        <button type="button" className="history-clear" onClick={requestClearAll}>
          Tout supprimer
        </button>
      )}
    </div>
  );

  if (entries.length === 0) {
    return (
      <>
        {title}
        <p className="page-subtitle">
          Vos questions posées depuis ce navigateur, conservées localement pour être revues sans les reposer.
        </p>
        <p className="history-empty">
          Aucune question dans votre historique. Les questions posées depuis ce navigateur apparaîtront ici.
        </p>
      </>
    );
  }

  return (
    <>
      {title}
      <p className="page-subtitle">
        Vos questions posées depuis ce navigateur, conservées localement pour être revues sans les reposer.
      </p>

      {openMenuId !== undefined && <div className="history-menu-overlay" onClick={() => setOpenMenuId(undefined)} />}

      <ul className="history-list">
        {entries.map((entry) => {
          const badge = formatConfianceBadge(entry.reponse.confiance);
          const menuOpen = openMenuId === entry.id;
          return (
            <li key={entry.id} className="history-item">
              <a href={`/historique/${encodeURIComponent(entry.id)}`} className="history-item-main">
                <span className="history-item-question">{entry.question}</span>
                <span className="history-item-meta">
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                  <span>{formatDateTimeFr(entry.askedAt)}</span>
                </span>
              </a>
              <button
                type="button"
                className="history-item-menu-button"
                aria-label="Options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setOpenMenuId((current) => (current === entry.id ? undefined : entry.id))}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>
              {menuOpen && (
                <div className="history-item-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="history-item-menu-delete"
                    onClick={() => requestRemove(entry.id, entry.question)}
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {confirm !== undefined && (
        <div className="confirm-overlay">
          <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">
              {confirm.kind === 'all' ? "Vider tout l'historique ?" : 'Supprimer cette question ?'}
            </h3>
            <p>
              {confirm.kind === 'all'
                ? 'Cette action est irréversible : toutes vos questions archivées localement seront supprimées.'
                : `La question « ${confirm.question} » sera retirée de votre historique. Cette action est irréversible.`}
            </p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={cancelConfirm}>
                Annuler
              </button>
              <button type="button" className="confirm-delete" onClick={confirmDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
