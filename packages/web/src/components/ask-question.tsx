'use client';

import { useEffect, useRef, useState } from 'react';
import { ReponseStructuree as ReponseStructureeSchema, type ReponseStructuree } from '@legirag/shared/schema';
import { askQuestion } from '../lib/api-client';
import { describeActivity } from '../lib/activity';
import { extractErrorMessage } from '../lib/errors';
import { ActivityIcon } from './activity-icon';
import { MainRule } from './main-rule';
import { SupplementaryTexts } from './supplementary-texts';
import { HorsPerimetre } from './hors-perimetre';
import { FooterBar } from './footer-bar';

const EXEMPLE_QUESTION = 'Est-ce que je peux rouler à 140 sur l’autoroute ?';
const EXEMPLE_QUESTIONS = [
  'Puis-je rouler à 140 sur l’autoroute ?',
  'Mon propriétaire peut-il augmenter le loyer chaque année ?',
  'Quel délai pour contester une amende ?',
];
const CONNECTION_ERROR_MESSAGE = "La connexion avec l'agent a été interrompue.";

type Status = 'idle' | 'asking' | 'done' | 'error';

interface ActivityLine {
  kind: string;
  label: string;
}

export function AskQuestion() {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [reponse, setReponse] = useState<ReponseStructuree | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  // F-09 : sans ça, "Nouvelle question" (ou un nouvel envoi) pendant un
  // flux en cours n'arrêtait rien - la boucle for-await abandonnée
  // continuait à recevoir des événements et à écraser l'état déjà
  // réinitialisé (voire après démontage du composant, ex. lien vers la
  // trace suivi en plein flux).
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  function reset() {
    abortControllerRef.current?.abort();
    setQuestion('');
    setStatus('idle');
    setActivity([]);
    setReponse(undefined);
    setErrorMessage(undefined);
  }

  function applyExample(exemple: string) {
    setQuestion(exemple);
    inputRef.current?.focus();
  }

  async function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0 || status === 'asking') {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('asking');
    setActivity([]);
    setReponse(undefined);
    setErrorMessage(undefined);

    try {
      for await (const event of askQuestion({ question: trimmed }, controller.signal)) {
        if (event.event === 'done') {
          setReponse(ReponseStructureeSchema.parse(event.data));
          setStatus('done');
        } else if (event.event === 'error') {
          setErrorMessage(extractErrorMessage(event.data));
          setStatus('error');
        } else {
          setActivity((previous) => [...previous, { kind: event.event, label: describeActivity(event) }]);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setErrorMessage(CONNECTION_ERROR_MESSAGE);
      setStatus('error');
    }
  }

  return (
    <>
      {status === 'idle' ? (
        <>
          <h1 className="page-title">Posez une question juridique.</h1>
          <p className="page-subtitle">
            Réponse sourcée dans les codes en vigueur, article par article — avec ce qu’elle ne couvre pas.
          </p>
        </>
      ) : (
        <h1 className="visually-hidden">legirag — Posez votre question</h1>
      )}

      {status === 'idle' ? (
        <>
          <form className="ask-form" onSubmit={(formEvent) => void handleSubmit(formEvent)}>
            <label className="visually-hidden" htmlFor="q">
              Posez votre question juridique
            </label>
            <input
              ref={inputRef}
              id="q"
              className="ask-input"
              type="text"
              value={question}
              onChange={(changeEvent) => setQuestion(changeEvent.target.value)}
              placeholder={EXEMPLE_QUESTION}
            />
            <button className="ask-submit" type="submit">
              Demander
            </button>
          </form>

          <div className="example-pills">
            {EXEMPLE_QUESTIONS.map((exemple) => (
              <button key={exemple} type="button" className="example-pill" onClick={() => applyExample(exemple)}>
                {exemple}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="question-recap">
          <p>
            <span className="quote-mark">« </span>
            {question}
            <span className="quote-mark"> »</span>
          </p>
          <button type="button" onClick={reset}>
            Nouvelle question
          </button>
        </div>
      )}

      {activity.length > 0 && (
        <ul className="activity" aria-label="Étapes suivies par l'agent">
          {activity.map((line, index) => (
            <li key={index} style={{ animationDelay: `${index * 110}ms` }}>
              <ActivityIcon kind={line.kind} />
              <span>{line.label}</span>
            </li>
          ))}
        </ul>
      )}

      {status === 'done' && reponse !== undefined && (
        <>
          <MainRule reponse={reponse} />
          <SupplementaryTexts reponse={reponse} />
          <HorsPerimetre items={reponse.hors_perimetre} />
          <FooterBar reponse={reponse} />
        </>
      )}

      {status === 'error' && errorMessage !== undefined && (
        <p role="alert" className="error-banner">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="inline-icon">
            <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--danger)" strokeWidth="1.6" />
            <line x1="9" y1="5.5" x2="9" y2="9.8" stroke="var(--danger)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="9" cy="12.6" r="0.9" fill="var(--danger)" />
          </svg>
          <span>{errorMessage}</span>
        </p>
      )}
    </>
  );
}
