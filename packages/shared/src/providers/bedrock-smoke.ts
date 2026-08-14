// Test de fumée 1.5 - pas dans la suite vitest : nécessite de vrais identifiants AWS Bedrock.
// Lancer avec : pnpm --filter @legirag/shared smoke
import { generateText } from 'ai';
import { bedrockProvider } from './bedrock.js';

const { text, usage } = await generateText({
  model: bedrockProvider.volume(),
  prompt: 'Réponds en une phrase : quelle est la capitale de la France ?',
});

console.log('Réponse :', text);
console.log('Tokens entrée/sortie :', usage.promptTokens, '/', usage.completionTokens);
