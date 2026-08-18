'use client';

import { useEffect, useRef, useState } from 'react';
import { ReponseStructuree as ReponseStructureeSchema, type ReponseStructuree } from '@legirag/shared/schema';
import { askQuestion } from '../lib/api-client';
import { describeActivity } from '../lib/activity';
import { extractErrorMessage } from '../lib/errors';
import { MainRule } from './main-rule';
import { SupplementaryTexts } from './supplementary-texts';
import { HorsPerimetre } from './hors-perimetre';
import { FooterBar } from './footer-bar';

const EXEMPLE_QUESTION = 'Est-ce que je peux rouler à 140 sur l’autoroute ?';
const CONNECTION_ERROR_MESSAGE = "La connexion avec l'agent a été interrompue.";

type Status = 'idle' | 'asking' | 'done' | 'error';

interface ActivityLine {
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
          setActivity((previous) => [...previous, { label: describeActivity(event) }]);
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
      <form className="ask-form" onSubmit={(formEvent) => void handleSubmit(formEvent)}>
        <label className="visually-hidden" htmlFor="q">
          Posez votre question juridique
        </label>
        <input
          id="q"
          className="ask-input"
          type="text"
          value={question}
          onChange={(changeEvent) => setQuestion(changeEvent.target.value)}
          placeholder={EXEMPLE_QUESTION}
          disabled={status === 'asking'}
        />
        <button className="ask-submit" type="submit" disabled={status === 'asking'}>
          Demander
        </button>
      </form>

      {status !== 'idle' && (
        <div className="ask-reset">
          <button type="button" onClick={reset}>
            Nouvelle question
          </button>
        </div>
      )}

      {activity.length > 0 && (
        <ul className="activity" aria-label="Étapes suivies par l'agent">
          {activity.map((line, index) => (
            <li key={index}>
              <span className="ok">✓</span> {line.label}
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
          {errorMessage}
        </p>
      )}
    </>
  );
}
