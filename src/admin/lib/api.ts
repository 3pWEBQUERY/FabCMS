import { track } from './progress';

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

// Loads count for the top progress bar; saves don't (they have their own «sichert …» state).
function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  return method === 'GET' ? track(send<T>(method, url, body)) : send<T>(method, url, body);
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
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
  /** Upload with progress (fetch can't report it, XMLHttpRequest can). */
  upload: <T>(url: string, form: FormData, onProgress?: (share: number) => void) =>
    track(
      new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('X-Nova', '1');
        xhr.responseType = 'json';
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onerror = () => reject(new ApiError(0, 'Keine Verbindung zum Server. Bitte versuch es nochmals.'));
        xhr.onload = () => {
          const data = xhr.response as { error?: string; details?: unknown } | null;
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
          if (xhr.status === 401) window.dispatchEvent(new CustomEvent('nova:unauthorized'));
          reject(new ApiError(xhr.status, data?.error ?? `Fehler ${xhr.status}`, data?.details));
        };
        xhr.send(form);
      }),
    ),
};

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
