export function json(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json(
    { message, ...extra },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export async function readJsonBody(request: Request, maxLength = 250_000) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new HttpError('The request must be sent as JSON.', 415);
  }
  const raw = await request.text();
  if (raw.length > maxLength) throw new HttpError('The request is too large.', 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError('The request could not be read.', 400);
  }
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof HttpError) return json(error.message, error.status);
  console.error(fallback, error);
  return json(fallback, 500);
}
