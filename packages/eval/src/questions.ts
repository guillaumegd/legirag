import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { EvaluationQuestion } from './schema.js';
import { questionsPath } from './data-paths.js';

export function loadEvaluationQuestions(): EvaluationQuestion[] {
  const raw: unknown = JSON.parse(readFileSync(questionsPath, 'utf-8'));
  return z.array(EvaluationQuestion).parse(raw);
}
