import type { ToolDescription } from '../tool-description.js';

export const routerQuestionDescription: ToolDescription = {
  name: 'router_question',
  version: 1,
  description:
    "Identifie le ou les codes juridiques français pertinents pour une question, parmi les codes réellement indexés dans le corpus. Peut retourner plusieurs codes à la fois (une question peut relever de plusieurs codes simultanément, par exemple un excès de vitesse peut relever à la fois du code de la route et du code pénal). Ne fait aucune recherche de texte (utiliser chercher_droit pour cela) : sert uniquement à décider où chercher.",
};
