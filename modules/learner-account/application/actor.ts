export type Actor = { learnerId: string };
export class OperationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
