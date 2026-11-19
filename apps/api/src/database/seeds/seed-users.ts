import * as path from 'path';
import * as dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@cidade-em-foco/shared';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config();

export interface SeedUserSpec {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  /** Nome do departamento (somente para o perfil Departamento). */
  department?: string;
}

/** Um usuário de cada tipo: administrador, gestor, triagem, departamento e cidadão. */
export const BASE_USERS: SeedUserSpec[] = [
  { name: 'Helena Vasconcelos (Admin)', email: 'admin@cidadeemfoco.gov.br', phone: '(11) 3113-9001', role: UserRole.ADMIN },
  { name: 'Roberto Almeida (Gestor)', email: 'gestor@cidadeemfoco.gov.br', phone: '(11) 3113-9002', role: UserRole.MANAGER },
  { name: 'Camila Nogueira (Triagem)', email: 'triagem@cidadeemfoco.gov.br', phone: '(11) 3113-9003', role: UserRole.TRIAGE },
  {
    name: 'Eng. Marcos Ribeiro (Obras)',
    email: 'obras@cidadeemfoco.gov.br',
    phone: '(11) 3113-9100',
    role: UserRole.DEPARTMENT,
    department: 'Obras e Infraestrutura',
  },
  { name: 'Mariana Souza', email: 'mariana.souza@exemplo.com.br', phone: '(11) 98765-4321', role: UserRole.CITIZEN },
];

/** Senha dos usuários do seed. Em produção ela precisa ser informada em SEED_USERS_PASSWORD. */
export function seedPassword(): string {
  const fromEnv = process.env.SEED_USERS_PASSWORD;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Seed] Defina SEED_USERS_PASSWORD para criar usuários em produção.');
  }
  return 'Senha@123';
}

/** Garante o departamento e devolve o id (idempotente). */
export async function ensureDepartment(
  client: PoolClient,
  name: string,
  responseDeadlineDays: number,
): Promise<string> {
  const res = await client.query(
    `INSERT INTO departments (name, response_deadline_days, active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [name, responseDeadlineDays],
  );
  return res.rows[0].id;
}

/** Cria o usuário ou, se o e-mail já existir, atualiza nome, papel, departamento e senha. */
export async function ensureUser(
  client: PoolClient,
  spec: SeedUserSpec,
  passwordHash: string,
  departmentId: string | null = null,
): Promise<string> {
  const res = await client.query(
    `INSERT INTO users (name, email, phone, password_hash, role, department_id, lgpd_consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           department_id = EXCLUDED.department_id,
           refresh_token_hash = NULL,
           updated_at = NOW()
     RETURNING id`,
    [spec.name, spec.email, spec.phone, passwordHash, spec.role, departmentId],
  );
  return res.rows[0].id;
}

/** Cria (ou restaura) um usuário de cada tipo. Pode ser executado quantas vezes quiser. */
export async function runSeedUsers(existingPool?: Pool): Promise<void> {
  const pool =
    existingPool ??
    new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'cidade_em_foco',
    });

  const password = seedPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const spec of BASE_USERS) {
      const departmentId = spec.department
        ? await ensureDepartment(client, spec.department, 3)
        : null;
      await ensureUser(client, spec, passwordHash, departmentId);
    }
    await client.query('COMMIT');

    console.log('[Seed] Usuários prontos (1 de cada tipo):');
    for (const u of BASE_USERS) {
      console.log(`  ${u.role.padEnd(10)} ${u.email}`);
    }
    console.log(
      process.env.SEED_USERS_PASSWORD
        ? '  Senha: a definida em SEED_USERS_PASSWORD'
        : `  Senha: ${password}`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Erro ao criar usuários:', err);
    throw err;
  } finally {
    client.release();
    if (!existingPool) await pool.end();
  }
}

if (require.main === module) {
  runSeedUsers().catch(() => process.exit(1));
}
