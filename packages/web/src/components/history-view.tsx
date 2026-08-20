'use client';

import { useEffect, useState } from 'react';
import { type HistoryEntry, clearHistory, listHistoryEntries, removeHistoryEntry } from '../lib/history';
import { formatConfianceBadge, formatDateTimeFr } from '../lib/format';
import { MainRule } from './main-rule';
import { SupplementaryTexts } from './supplementary-texts';
import { HorsPerimetre } from './hors-perimetre';
import { FooterBar } from './footer-bar';

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const all = listHistoryEntries();
    setEntries(all);
    const requestedId = new URLSearchParams(window.location.search).get('entry');
    if (requestedId !== null && all.some((entry) => entry.id === requestedId)) {
      setSelectedId(requestedId);
    }
  }, []);

  function goBackToList() {
    setSelectedId(undefined);
    window.history.replaceState(null, '', '/historique');
  }

  function handleRemove(id: string, question: string) {
    if (!confirm(`Supprimer la question « ${question} » de votre historique ? Cette action est irréversible.`)) {
      return;
    }
    removeHistoryEntry(id);
    setEntries(listHistoryEntries());
    setSelectedId((current) => (current === id ? undefined : current));
  }

  function handleClearAll() {
    if (!confirm('Vider tout votre historique local ? Cette action est irréversible.')) {
      return;
    }
    clearHistory();
    setEntries([]);
    setSelectedId(undefined);
  }

  if (entries === undefined) {
    return null;
  }

  const selected = entries.find((entry) => entry.id === selectedId);

  if (selected !== undefined) {
    return (
      <>
        <button type="button" className="history-back" onClick={goBackToList}>
          ← Retour à l'historique
        </button>
        <p className="history-archived-notice">
          Réponse archivée localement le {formatDateTimeFr(selected.askedAt)} - le texte cité a pu évoluer depuis ;
          consultez la source officielle via le lien Légifrance.
        </p>
        <MainRule reponse={selected.reponse} />
        <SupplementaryTexts reponse={selected.reponse} />
        <HorsPerimetre items={selected.reponse.hors_perimetre} />
        <FooterBar reponse={selected.reponse} />
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="history-empty">
        Aucune question dans votre historique. Les questions posées depuis ce navigateur apparaîtront ici.
      </p>
    );
  }

  return (
    <>
      <div className="history-toolbar">
        <button type="button" className="history-clear" onClick={handleClearAll}>
          Vider l'historique
        </button>
      </div>
      <ul className="history-list">
        {entries.map((entry) => {
          const badge = formatConfianceBadge(entry.reponse.confiance);
          return (
            <li key={entry.id} className="history-item">
              <button type="button" className="history-item-main" onClick={() => setSelectedId(entry.id)}>
                <span className="history-item-question">{entry.question}</span>
                <span className="history-item-meta">
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                  <span>{formatDateTimeFr(entry.askedAt)}</span>
                </span>
              </button>
              <button
                type="button"
                className="history-item-remove"
                aria-label={`Supprimer la question « ${entry.question} » de l'historique`}
                onClick={() => handleRemove(entry.id, entry.question)}
              >
                Supprimer
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
