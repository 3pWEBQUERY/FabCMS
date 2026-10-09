/** Thin fetch wrapper: JSON in/out, the CSRF header, readable German errors. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'X-Nova': '1' }, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server. Deine Änderungen bleiben hier, bis die Verbindung zurück ist.');
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/session')) window.dispatchEvent(new CustomEvent('nova:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Fehler ${res.status}`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
};

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
