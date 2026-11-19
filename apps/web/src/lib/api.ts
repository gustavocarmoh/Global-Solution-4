import { ApiErrorResponse, UserRole } from '@cidade-em-foco/shared';

export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1'
).replace(/\/+$/, '');

/** Origem da API (sem o prefixo /api/v1), usada para montar URLs de fotos. */
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+$/, '');

/** A API devolve caminhos relativos (ex.: /api/v1/photos/view/...); aqui viram URLs absolutas. */
export function assetUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${API_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

const TOKEN_STORAGE_KEY = 'cf_auth_tokens_v1';
const USER_STORAGE_KEY = 'cf_auth_user_v1';
const SESSION_EVENT = 'cf-session-changed';
const EXPIRED_FLAG = 'cf_session_expired';

/** Lê (e apaga) o aviso de que a sessão expirou, para exibi-lo na tela de login. */
export function consumeSessionExpiredFlag(): boolean {
  try {
    const flagged = sessionStorage.getItem(EXPIRED_FLAG) === '1';
    sessionStorage.removeItem(EXPIRED_FLAG);
    return flagged;
  } catch {
    return false;
  }
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  departmentId?: string | null;
  departmentName?: string | null;
}

export const STAFF_ROLES: UserRole[] = [
  UserRole.TRIAGE,
  UserRole.DEPARTMENT,
  UserRole.MANAGER,
  UserRole.ADMIN,
];

export function isStaff(user?: { role?: string } | null): boolean {
  return Boolean(user?.role && STAFF_ROLES.includes(user.role as UserRole));
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Falha de rede ou servidor fora do ar (sem resposta HTTP). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function notifySessionChange(): void {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // ambiente sem window (testes)
  }
}

export function onSessionChange(listener: () => void): () => void {
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SESSION_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(tokens: StoredTokens, user: unknown): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  notifySessionChange();
}

export function updateStoredUser(patch: Partial<SessionUser>): void {
  const current = getStoredUser();
  if (!current) return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  notifySessionChange();
}

export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  notifySessionChange();
}

export function getStoredUser<T = SessionUser>(): T | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* Renovação do token de acesso: uma única chamada em andamento por vez. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) return false;
        const next = (await res.json()) as StoredTokens;
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function rawFetch(endpoint: string, options: RequestInit): Promise<Response> {
  const tokens = getStoredTokens();
  const headers = new Headers(options.headers || {});

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  try {
    return await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
    );
  }
}

async function authorizedFetch(endpoint: string, options: RequestInit): Promise<Response> {
  let response = await rawFetch(endpoint, options);

  // Token de acesso expirado: renova uma vez e repete a chamada original
  if (response.status === 401 && getStoredTokens()?.refreshToken) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      response = await rawFetch(endpoint, options);
    } else {
      // Sessão encerrada pelo servidor (expirou ou foi invalidada): pede novo login
      try {
        sessionStorage.setItem(EXPIRED_FLAG, '1');
      } catch {
        // sem sessionStorage, apenas segue para o login
      }
      clearStoredSession();
    }
  }

  if (!response.ok) {
    let errorData: Partial<ApiErrorResponse> = {};
    try {
      errorData = await response.json();
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(
      errorData.message || 'Não foi possível concluir a operação no momento.',
      response.status,
      errorData.code || 'HTTP_ERROR',
      errorData.details,
    );
  }
  return response;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authorizedFetch(endpoint, options);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

/** Baixa um arquivo protegido por autenticação (CSV/PDF dos relatórios). */
export async function apiDownload(endpoint: string, fallbackName: string): Promise<void> {
  const response = await authorizedFetch(endpoint, {});
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const fileName = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackName;
  saveBlob(blob, fileName);
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
