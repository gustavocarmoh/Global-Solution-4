/**
 * Leitura centralizada de segredos e parâmetros de ambiente.
 * Em produção, a ausência de um segredo interrompe a inicialização em vez de
 * cair silenciosamente em um valor de desenvolvimento conhecido.
 */
const DEV_DEFAULTS = {
  JWT_ACCESS_SECRET: 'cf_dev_access_secret_key_change_in_prod_2026',
  JWT_REFRESH_SECRET: 'cf_dev_refresh_secret_key_change_in_prod_2026',
  CONTACT_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
} as const;

function secret(name: keyof typeof DEV_DEFAULTS): string {
  const value = process.env[name];
  const isProd = process.env.NODE_ENV === 'production';
  if (value && !(isProd && value === DEV_DEFAULTS[name])) return value;
  if (isProd) {
    throw new Error(
      `[config] ${name} precisa ser definido com um valor próprio em produção.`,
    );
  }
  return value || DEV_DEFAULTS[name];
}

export const config = {
  get jwtAccessSecret(): string {
    return secret('JWT_ACCESS_SECRET');
  },
  get jwtRefreshSecret(): string {
    return secret('JWT_REFRESH_SECRET');
  },
  get contactEncryptionKey(): string {
    const key = secret('CONTACT_ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(
        '[config] CONTACT_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes).',
      );
    }
    return key;
  },
  /** Validade do token de acesso; o cliente o renova sozinho com o refresh token. */
  get accessTtlSeconds(): number {
    const minutes = Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15);
    return Math.max(1, Math.round(minutes * 60));
  },
  /** Duração absoluta de uma sessão: passada essa janela, é preciso entrar de novo. */
  get sessionMaxSeconds(): number {
    const hours = Number(process.env.SESSION_MAX_HOURS || 24);
    return Math.max(1, Math.round(hours * 3600));
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Escapa os curingas do LIKE/ILIKE para que o texto digitado seja buscado literalmente. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => '\\' + ch);
}
