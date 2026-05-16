import type { Response } from "express";

export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ApiError {
  error: string;
  code: ErrorCode;
  message?: string;
}

export function sendError(
  res: Response,
  status: number,
  error: string,
  code: ErrorCode,
  message?: string
): Response {
  const response: ApiError = { error, code };
  if (message) {
    response.message = message;
  }
  return res.status(status).json(response);
}
