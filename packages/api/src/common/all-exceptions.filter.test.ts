import { BadRequestException, HttpException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

class FakeResponse {
  statusCode: number | undefined;
  body: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }
}

function fakeHost(response: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  it('laisse passer un HttpException connu avec son statut et son corps inchangés', () => {
    const filter = new AllExceptionsFilter();
    const response = new FakeResponse();
    const exception = new BadRequestException('question : ne peut pas être vide');

    filter.catch(exception, fakeHost(response));

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(exception.getResponse());
  });

  it("normalise un HttpException dont getResponse() est une simple chaîne (ex. ThrottlerException) vers la même forme", () => {
    const filter = new AllExceptionsFilter();
    const response = new FakeResponse();
    const exception = new HttpException('Too Many Requests', 429);

    filter.catch(exception, fakeHost(response));

    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too Many Requests',
    });
  });

  it('sanitise une exception inattendue en 500 générique sans fuiter son message', () => {
    const filter = new AllExceptionsFilter();
    const response = new FakeResponse();
    const exception = new Error('détail interne sensible : connexion pg refusée sur 10.0.0.5');

    filter.catch(exception, fakeHost(response));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Une erreur interne est survenue.',
    });
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });

  it('sanitise une valeur qui rejette sans être une Error', () => {
    const filter = new AllExceptionsFilter();
    const response = new FakeResponse();

    filter.catch('juste une chaîne rejetée', fakeHost(response));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Une erreur interne est survenue.',
    });
  });
});
