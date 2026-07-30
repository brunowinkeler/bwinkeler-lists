export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = '/api';
const CSRF_COOKIE = 'lists_csrf';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

async function ensureCsrfToken(): Promise<string> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' });
    token = readCookie(CSRF_COOKIE);
  }
  if (!token) {
    throw new Error('Unable to obtain a CSRF token');
  }
  return token;
}

async function toError(response: Response): Promise<ApiError> {
  let message = response.statusText;
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) message = data.error;
  } catch {
    // response had no JSON body
  }
  return new ApiError(response.status, message);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await ensureCsrfToken();
  const hasBody = body !== undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      // Only advertise a JSON body when one is actually sent; otherwise Fastify
      // rejects the request with 400 for an empty application/json body.
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      'x-csrf-token': token,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
