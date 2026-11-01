export type Actor = { learnerId: string };
export class OperationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'OperationError';
    this.status = status;
    Object.setPrototypeOf(this, OperationError.prototype);
  }
}
