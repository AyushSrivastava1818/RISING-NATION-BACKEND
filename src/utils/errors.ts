export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public data?: any;

  constructor(statusCode: number, code: string, message: string, data?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', data?: any) {
    super(400, 'validation_error', message, data);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, 'unauthenticated', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', data?: any) {
    super(409, 'conflict', message, data);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string = 'Unprocessable entity', data?: any) {
    super(422, 'unprocessable', message, data);
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super(429, 'rate_limited', message);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string = 'Upstream service error') {
    super(502, 'upstream_error', message);
  }
}
