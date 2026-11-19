import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Endereço da API visto pelo aparelho.
 * 1. EXPO_PUBLIC_API_URL, se definido (ex.: http://192.168.0.10:3000/api/v1);
 * 2. senão, o mesmo host que serve o bundle do Expo (o IP da máquina de desenvolvimento),
 *    pois "localhost" dentro do celular aponta para o próprio celular;
 * 3. por fim, localhost (Expo Web e simulador iOS).
 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, '');

  if (Platform.OS !== 'web') {
    const hostUri: string | undefined =
      Constants.expoConfig?.hostUri ??
      (Constants as any).expoGoConfig?.debuggerHost ??
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
    const host = hostUri?.split(':')[0];
    if (host) return `http://${host}:3000/api/v1`;
    // Emulador Android sem hostUri: 10.0.2.2 é a máquina hospedeira
    if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  }
  return 'http://localhost:3000/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+$/, '');

/** A API devolve caminhos relativos para as fotos; aqui viram URLs absolutas. */
export function assetUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${API_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  textSizePref?: string;
  highContrastPref?: boolean;
  reduceMotionPref?: boolean;
  emailNotifications?: boolean;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/* ---------------------------------------------------------------------------
 * Armazenamento da sessão: Keychain/Keystore no aparelho (expo-secure-store)
 * e localStorage no Expo Web.
 * ------------------------------------------------------------------------- */
const SESSION_KEY = 'cf_mobile_session_v1';

async function storageGet(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(SESSION_KEY) ?? null;
    }
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function storageSet(value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(SESSION_KEY);
      else globalThis.localStorage?.setItem(SESSION_KEY, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await SecureStore.setItemAsync(SESSION_KEY, value);
  } catch {
    // Sem armazenamento disponível a sessão vale só enquanto o app estiver aberto
  }
}

let tokens: Tokens | null = null;
let onSessionExpired: (() => void) | null = null;

/** Chamado quando o servidor recusa a renovação do token (sessão encerrada). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export async function saveSession(next: Tokens, user: SessionUser): Promise<void> {
  tokens = next;
  await storageSet(JSON.stringify({ tokens: next, user }));
}

export async function saveSessionUser(user: SessionUser): Promise<void> {
  if (!tokens) return;
  await storageSet(JSON.stringify({ tokens, user }));
}

export async function clearSession(): Promise<void> {
  tokens = null;
  await storageSet(null);
}

/** Restaura a sessão gravada no aparelho ao abrir o app. */
export async function restoreSession(): Promise<SessionUser | null> {
  const raw = await storageGet();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { tokens: Tokens; user: SessionUser };
    if (!parsed?.tokens?.refreshToken || !parsed.user) return null;
    tokens = parsed.tokens;
    return parsed.user;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!tokens?.refreshToken) return false;
  if (!refreshInFlight) {
    const current = tokens.refreshToken;
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current }),
        });
        if (!res.ok) return false;
        const next = (await res.json()) as Tokens;
        tokens = next;
        const raw = await storageGet();
        const user = raw ? JSON.parse(raw).user : null;
        if (user) await storageSet(JSON.stringify({ tokens: next, user }));
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
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  const isForm =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isForm && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  try {
    return await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError(
      `Não foi possível conectar ao servidor (${API_ORIGIN}). Verifique sua conexão.`,
      0,
      'NETWORK_ERROR',
    );
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let response = await rawFetch(endpoint, options);

  if (response.status === 401 && tokens?.refreshToken) {
    if (await refreshAccessToken()) {
      response = await rawFetch(endpoint, options);
    } else {
      await clearSession();
      onSessionExpired?.();
    }
  }

  if (!response.ok) {
    let body: { message?: string; code?: string } = {};
    try {
      body = await response.json();
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(
      body.message || 'Não foi possível concluir a operação no momento.',
      response.status,
      body.code || 'HTTP_ERROR',
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
