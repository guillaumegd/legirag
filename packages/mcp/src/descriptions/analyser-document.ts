import type { ToolDescription } from '../tool-description.js';

export const analyserDocumentDescription: ToolDescription = {
  name: 'analyser_document',
  version: 1,
  description:
    "Outil non implémenté (mode document déposé, optionnel, non construit). Censé baliser un document fourni par l'utilisateur et en extraire les passages pertinents à une question, mais échoue systématiquement aujourd'hui. Ne pas appeler pour répondre à une question réelle : utiliser demander_a_l_humain pour une question portant sur un document fourni par l'utilisateur.",
};
