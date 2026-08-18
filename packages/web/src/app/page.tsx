import { AskQuestion } from '../components/ask-question';

export default function HomePage() {
  return (
    <main id="main" className="wrap">
      <h1 className="visually-hidden">legirag — Posez votre question</h1>
      <AskQuestion />
    </main>
  );
}
