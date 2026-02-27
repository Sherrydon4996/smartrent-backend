export class AppError extends Error {
  constructor(message, statusCode = 500, code = "APP_ERROR") {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
