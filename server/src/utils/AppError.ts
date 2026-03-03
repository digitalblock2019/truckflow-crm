export class AppError extends Error {
  public readonly statusCode: number;
  public readonly key: string;

  constructor(message: string, statusCode = 400, key = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.key = key;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
