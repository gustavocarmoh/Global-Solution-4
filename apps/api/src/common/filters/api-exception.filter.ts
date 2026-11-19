import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'VALIDATION_ERROR',
        message: exception.errors[0]?.message || 'Dados inválidos informados na requisição.',
        details: exception.errors,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resBody = exception.getResponse() as any;

      const code =
        resBody?.code ||
        this.mapStatusToCode(status);

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        response.status(status).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.',
        });
        return;
      }
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(status).json({
          code: 'PHOTO_TOO_LARGE',
          message: 'Cada foto pode ter no máximo 5 MB.',
        });
        return;
      }
      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof resBody?.message === 'string' &&
        /unexpected field|too many files/i.test(resBody.message)
      ) {
        response.status(status).json({
          code: 'MAX_PHOTOS_EXCEEDED',
          message: 'São permitidas no máximo 5 fotos por solicitação.',
        });
        return;
      }

      const message =
        typeof resBody === 'string'
          ? resBody
          : Array.isArray(resBody?.message)
            ? resBody.message[0]
            : resBody?.message || 'Ocorreu um erro ao processar sua solicitação.';

      response.status(status).json({
        code,
        message,
        details: resBody?.details ?? undefined,
      });
      return;
    }

    const pgCode = (exception as { code?: string } | null)?.code;
    if (pgCode === '22P02') {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'INVALID_PARAMETER',
        message: 'Um dos parâmetros informados tem formato inválido.',
      });
      return;
    }
    if (pgCode === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        code: 'CONFLICT',
        message: 'Já existe um registro com esses dados.',
      });
      return;
    }
    if (pgCode === '23503') {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'INVALID_REFERENCE',
        message: 'Um dos itens referenciados não existe.',
      });
      return;
    }

    console.error('[UnhandledException]', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno no servidor. Tente novamente em instantes.',
    });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'HTTP_ERROR';
    }
  }
}
