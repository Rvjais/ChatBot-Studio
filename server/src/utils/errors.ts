export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const tooLarge = (message: string) => new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, 'UNPROCESSABLE', message, details);
