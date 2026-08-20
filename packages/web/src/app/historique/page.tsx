import { HistoryView } from '../../components/history-view';

export default function HistoriquePage() {
  return (
    <main id="main" className="wrap">
      <h1 className="page-title">Historique</h1>
      <p className="page-subtitle">
        Vos questions posées depuis ce navigateur, conservées localement pour être revues sans les reposer.
      </p>
      <HistoryView />
    </main>
  );
}
