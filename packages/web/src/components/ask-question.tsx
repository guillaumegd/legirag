'use client';

import { useEffect, useRef, useState } from 'react';
import { ReponseStructuree as ReponseStructureeSchema, type ReponseStructuree } from '@legirag/shared/schema';
import { askQuestion } from '../lib/api-client';
import { describeActivity } from '../lib/activity';
import { extractErrorMessage } from '../lib/errors';
import { saveHistoryEntry } from '../lib/history';
import { ActivityIcon } from './activity-icon';
import { ClockIcon } from './clock-icon';
import { ConfidenceBanner } from './confidence-banner';
import { MainRule } from './main-rule';
import { SupplementaryTexts } from './supplementary-texts';
import { HorsPerimetre } from './hors-perimetre';
import { FooterBar } from './footer-bar';
import { RecentHistoryPreview } from './recent-history-preview';

const EXEMPLE_QUESTION = 'Est-ce que je peux rouler à 140 sur l’autoroute ?';
const EXEMPLE_QUESTIONS = [
  {
    question: 'Puis-je rouler à 140 sur l’autoroute ?',
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="9" width="15" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 9l1.7-3.5a2 2 0 011.8-1h4a2 2 0 011.8 1L15.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="6" cy="15" r="1.4" fill="currentColor" />
        <circle cx="14" cy="15" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    question: 'Mon propriétaire peut-il augmenter le loyer chaque année ?',
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 10l7-6 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 9v6.5a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    question: 'Quel délai pour contester une amende ?',
    icon: <ClockIcon size={15} />,
  },
];
const HORS_PERIMETRE_EXAMPLE = 'Quelle est la durée du préavis de licenciement en droit du travail allemand ?';
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
    void submit(question);
  }

  function submitHorsPerimetreExample() {
    setQuestion(HORS_PERIMETRE_EXAMPLE);
    void submit(HORS_PERIMETRE_EXAMPLE);
  }

  async function submit(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
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
          const parsedReponse = ReponseStructureeSchema.parse(event.data);
          setReponse(parsedReponse);
          setStatus('done');
          saveHistoryEntry({ id: parsedReponse.trace_id, question: trimmed, reponse: parsedReponse, askedAt: new Date().toISOString() });
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
        <div className="view-rise-in">
          <h1 className="page-title">Posez une question juridique.</h1>
          <p className="page-subtitle">
            Réponse sourcée dans les codes en vigueur, article par article — avec ce qu’elle ne couvre pas.
          </p>

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
              <span>Demander</span>
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <div className="example-pills">
            {EXEMPLE_QUESTIONS.map(({ question: exemple, icon }) => (
              <button key={exemple} type="button" className="example-pill" onClick={() => applyExample(exemple)}>
                {icon}
                <span>{exemple}</span>
              </button>
            ))}
          </div>

          <button type="button" className="hors-perimetre-example-link" onClick={submitHorsPerimetreExample}>
            Voir un exemple hors périmètre →
          </button>

          <RecentHistoryPreview />
        </div>
      ) : (
        <>
          <h1 className="visually-hidden">legirag — Posez votre question</h1>
          <div className="question-recap">
            <p>
              <span className="quote-mark">« </span>
              {question}
              <span className="quote-mark"> »</span>
            </p>
            <button type="button" className="question-recap-reset" onClick={reset}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>Nouvelle question</span>
            </button>
          </div>
        </>
      )}

      {activity.length > 0 && (
        <ul className="activity" aria-label="Étapes suivies par l'agent">
          {activity.map((line, index) => (
            <li key={index} style={{ animationDelay: `${index * 110}ms` }}>
              <ActivityIcon kind={line.kind} />
              <span>{line.label}</span>
            </li>
          ))}
          {status === 'asking' && (
            <li className="asking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </li>
          )}
        </ul>
      )}

      {status === 'done' && reponse !== undefined && (
        <>
          <div className="view-rise-in">
            <ConfidenceBanner confiance={reponse.confiance} dateReference={reponse.date_reference} />
            <MainRule reponse={reponse} />
            <SupplementaryTexts reponse={reponse} />
            <HorsPerimetre items={reponse.hors_perimetre} />
          </div>
          {/* Hors de .view-rise-in : FooterBar rend TracePanel, dont
              .trace-aside est position:fixed - imbriqué sous un ancêtre dont
              le transform est actif (même le temps de l'animation, pas
              seulement son état final), il hériterait d'un containing block
              différent de la fenêtre, provoquant un flash visible du panneau
              fermé pendant les 420ms de l'animation. */}
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
