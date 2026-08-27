export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(400, 'validation_error', message);
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
  constructor(message: string = 'Conflict') {
    super(409, 'conflict', message);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string = 'Unprocessable entity') {
    super(422, 'unprocessable', message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super(429, 'rate_limited', message);
  }
}
