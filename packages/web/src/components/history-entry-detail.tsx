'use client';

import { type HistoryEntry } from '../lib/history';
import { formatDateTimeFr } from '../lib/format';
import { ConfidenceBanner } from './confidence-banner';
import { MainRule } from './main-rule';
import { SupplementaryTexts } from './supplementary-texts';
import { HorsPerimetre } from './hors-perimetre';
import { FooterBar } from './footer-bar';

export function HistoryEntryDetail({ entry }: { entry: HistoryEntry }) {
  return (
    <>
      <a href="/historique" className="history-back">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M12.5 5L7 10l5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Retour à l'historique</span>
      </a>
      <p className="history-archived-notice">
        Réponse archivée localement le {formatDateTimeFr(entry.askedAt)} - le texte cité a pu évoluer depuis ;
        consultez la source officielle via le lien Légifrance.
      </p>
      <ConfidenceBanner confiance={entry.reponse.confiance} dateReference={entry.reponse.date_reference} />
      <MainRule reponse={entry.reponse} />
      <SupplementaryTexts reponse={entry.reponse} />
      <HorsPerimetre items={entry.reponse.hors_perimetre} />
      <FooterBar reponse={entry.reponse} />
    </>
  );
}
