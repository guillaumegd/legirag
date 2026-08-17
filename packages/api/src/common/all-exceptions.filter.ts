import { STATUS_CODES } from 'node:http';
import { HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

// Un HttpException dont getResponse() est déjà un objet (BadRequestException,
// NotFoundException...) passe tel quel - forme { statusCode, error, message }
// déjà produite par défaut (11a/11b). Certains HttpException (ThrottlerException
// notamment, vérifié en direct en 11c) renvoient une simple chaîne à la place -
// normalisée ici vers la même forme plutôt que de laisser passer une réponse
// différemment formée selon l'exception qui l'a déclenchée.
function normalizeHttpExceptionBody(exception: HttpException): Record<string, unknown> {
  const body = exception.getResponse();
  if (typeof body !== 'string') return body as Record<string, unknown>;

  const status = exception.getStatus();
  return { statusCode: status, error: STATUS_CODES[status] ?? 'Error', message: body };
}

// La seule vraie valeur ajoutée par ce filtre pour les exceptions non-HTTP :
// toute exception inattendue (pg brute, bug non prévu) ne fuite jamais son
// message d'origine ni sa pile - seulement une 500 générique, en français
// comme le reste de ce projet, pendant que le détail réel part dans les logs
// serveur.
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(normalizeHttpExceptionBody(exception));
      return;
    }

    console.error('AllExceptionsFilter : exception non gérée.', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Une erreur interne est survenue.',
    });
  }
}
