// Réponse partagée par les outils non implémentés (version_a_la_date,
// resoudre_convention, analyser_document) : isError plutôt qu'un faux succès,
// même logique d'honnêteté que confiance: 'abstention' et suivre_renvoi /
// nonResolus ailleurs dans ce projet - voir current-feature.md / "Scope
// decision: stub behavior".
export interface StubToolResult {
  // Index signature requise pour rester assignable au CallToolResult du SDK
  // MCP (@modelcontextprotocol/sdk/types.js), qui en porte une lui-même.
  [key: string]: unknown;
  content: [{ type: 'text'; text: string }];
  isError: true;
}

export function stubToolResult(message: string): StubToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
