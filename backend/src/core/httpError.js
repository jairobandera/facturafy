// Error HTTP con codigo de estado, equivalente a ResponseStatusException de Spring.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const unauthorized = (msg = 'No autorizado') => new HttpError(401, msg);
export const forbidden = (msg = 'Prohibido') => new HttpError(403, msg);
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
