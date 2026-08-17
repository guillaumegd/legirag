import { randomUUID } from 'node:crypto';
import { buildFixedChainGraph } from '@legirag/agent';
import type { Confiance } from '@legirag/shared';
import { aggregateAgentResults, scoreAgentQuestion, type AgentHarnessReport, type AgentQuestionScore } from './agent-scoring.js';
import type { CostRow } from './cost-metrics.js';
import { scoreCrossRefCoverage } from './cross-ref-coverage.js';
import { codesForArticles, fetchCodeSlugsByArticleId } from './expected-codes.js';
import { createDatabaseClient } from './pg-client.js';
import { loadEvaluationQuestions } from './questions.js';

export interface CoverageRow {
  questionId: string;
  coverage: number;
}

export interface AgentHarnessRun {
  agentReport: AgentHarnessReport;
  costRows: CostRow[];
  coverageRows: CoverageRow[];
  scores: AgentQuestionScore[];
}

export interface QuestionScored {
  question: string;
  expectedCodes: string[];
  actualCodes: string[];
  actualConfiance: Confiance;
  score: AgentQuestionScore;
  costRow: CostRow;
  coverageRow: CoverageRow | undefined;
}

// Item 12b : la boucle d'exécution en direct (Bedrock + Supabase, un coût
// réel par appel) extraite de run-agent-harness.ts pour être partagée avec
// run-regression-check.ts (12b) sans dupliquer les appels live. onQuestionScored
// est optionnel et appelé question par question, pendant le run (pas
// seulement à la fin) : run-agent-harness.ts (item 9) l'utilise pour garder
// son affichage incrémental d'origine, un run de plusieurs minutes ne doit
// pas rester muet jusqu'à la toute dernière question.
export async function runAgentHarness(onQuestionScored?: (event: QuestionScored) => void): Promise<AgentHarnessRun> {
  const questions = loadEvaluationQuestions();

  const client = createDatabaseClient();
  await client.connect();
  let codeByArticleId: Map<string, string>;
  try {
    const allExpectedIds = questions.flatMap((q) => q.articlesAttendus ?? []);
    codeByArticleId = await fetchCodeSlugsByArticleId(client, allExpectedIds);
  } finally {
    await client.end();
  }

  const scores: AgentQuestionScore[] = [];
  const costRows: CostRow[] = [];
  const coverageRows: CoverageRow[] = [];

  for (const q of questions) {
    const graph = buildFixedChainGraph();
    const dateReference = q.dateReference ? new Date(q.dateReference) : new Date();
    const result = await graph.invoke({
      question: q.question,
      dateReference,
      codes: undefined,
      traceId: randomUUID(),
      reponse: undefined,
    });

    const expectedCodes = codesForArticles(q.articlesAttendus ?? [], codeByArticleId);
    const actualCodes = result.codes ?? [];
    const actualConfiance = result.reponse?.confiance ?? 'abstention';
    const score = scoreAgentQuestion(q, expectedCodes, actualCodes, actualConfiance);
    scores.push(score);

    // +1 : routerQuestion ne retente jamais - toujours exactement un appel.
    // Coût du routeur exclu de promptTokens/completionTokens (voir "Scope
    // decision" de 9b) - draft porte le coût dominant, prompt complet inclus.
    const costRow: CostRow = {
      questionId: q.id,
      category: q.category,
      llmCalls: 1 + result.draftAttempts,
      promptTokens: result.tokenUsage?.promptTokens ?? 0,
      completionTokens: result.tokenUsage?.completionTokens ?? 0,
      renvoiIterations: result.renvoiIterations,
    };
    costRows.push(costRow);

    let coverageRow: CoverageRow | undefined;
    if (q.category === 'renvoi_obligatoire') {
      coverageRow = { questionId: q.id, coverage: scoreCrossRefCoverage(q.articlesAttendus ?? [], result.citations) };
      coverageRows.push(coverageRow);
    }

    onQuestionScored?.({ question: q.question, expectedCodes, actualCodes, actualConfiance, score, costRow, coverageRow });
  }

  return { agentReport: aggregateAgentResults(scores), costRows, coverageRows, scores };
}
