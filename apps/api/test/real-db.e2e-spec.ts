import '../src/env';

// Captura os e-mails em vez de enviá-los: o teste lê o link de redefinição daqui
const sentMails: Array<{ to: string; subject: string; text: string }> = [];
jest.mock('../src/common/mailer', () => ({
  sendMail: jest.fn(async (message: { to: string; subject: string; text: string }) => {
    sentMails.push(message);
    return true;
  }),
}));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { runMigrations } from '../src/database/migrations/run-migrations';
import { runSeed, SEED_TOTAL } from '../src/database/seeds/run-seed';
import { BASE_USERS, runSeedUsers } from '../src/database/seeds/seed-users';

/**
 * E2E contra PostgreSQL + PostGIS reais, em um banco descartável
 * (`cidade_em_foco_e2e`) criado e populado pelo próprio teste.
 * Requer a infraestrutura no ar: `npm run infra:up`.
 * Sem banco acessível, a suíte FALHA com uma mensagem clara (não passa em falso).
 */
const TEST_DB = 'cidade_em_foco_e2e';
const baseConn = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

async function databaseReachable(): Promise<boolean> {
  const client = new Client({ ...baseConn, database: 'postgres', connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

let reachable = false;
beforeAll(async () => {
  reachable = await databaseReachable();
  if (!reachable) {
    console.warn(
      '[real-db e2e] PostgreSQL inacessível. Suba a infraestrutura com `npm run infra:up`.',
    );
  }
});

describe('API com PostgreSQL/PostGIS real', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const api = '/api/v1';

  // Local afastado dos pontos do seed para não colidir com a detecção de duplicidade
  const SPOT = { latitude: -23.7001, longitude: -46.8001 };
  let categoryId: string;
  let citizenToken: string;
  let triageToken: string;
  let managerToken: string;

  const itDb = (name: string, fn: () => Promise<void>, timeout?: number) =>
    it(name, async () => {
      if (!reachable) {
        throw new Error(
          'PostgreSQL inacessível. Suba a infraestrutura com `npm run infra:up` antes de rodar esta suíte.',
        );
      }
      await fn();
    }, timeout);

  beforeAll(async () => {
    if (!reachable) return;

    const admin = new Client({ ...baseConn, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    await admin.end();

    process.env.POSTGRES_DB = TEST_DB;
    process.env.SMTP_DISABLED = 'true'; // nenhum e-mail real durante os testes
    process.env.RATE_LIMIT_DISABLED = 'true'; // a suíte faz muitos logins seguidos

    const pool = new Pool({ ...baseConn, database: TEST_DB });
    await runMigrations(pool);
    await runSeed(pool);
    await pool.end();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    http = request(app.getHttpServer());

    const cats = await http.get(`${api}/categories`).expect(200);
    categoryId = cats.body.find((c: any) => c.slug === 'drenagem').id;

    const login = (path: string, body: object) =>
      http.post(`${api}${path}`).send(body).expect(200).then((r) => r.body.accessToken);
    citizenToken = await login('/auth/login', {
      email: 'carlos.santos@exemplo.com.br',
      password: 'Senha@123',
    });
    triageToken = await login('/admin/auth/login', {
      email: 'triagem@cidadeemfoco.gov.br',
      password: 'Senha@123',
    });
    managerToken = await login('/admin/auth/login', {
      email: 'gestor@cidadeemfoco.gov.br',
      password: 'Senha@123',
    });
  }, 120_000);

  afterAll(async () => {
    if (!reachable) return;
    await app?.close();
    const admin = new Client({ ...baseConn, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.end();
  });

  const newOccurrence = (overrides: Record<string, unknown> = {}) => ({
    categoryId,
    description: 'Bueiro entupido alagando a esquina sempre que chove forte',
    addressText: 'Rua dos Testes, 100',
    neighborhood: 'Centro',
    ...SPOT,
    ...overrides,
  });

  itDb('painéis públicos refletem exatamente o que está no banco', async () => {
    const stats = await http.get(`${api}/public/stats`).expect(200);
    expect(stats.body.registered).toBe(SEED_TOTAL);
    expect(stats.body.resolved).toBe(912);

    const byNeighborhood = await http.get(`${api}/public/stats/by-neighborhood`).expect(200);
    const sum = byNeighborhood.body.reduce((acc: number, r: any) => acc + r.value, 0);
    expect(sum).toBe(SEED_TOTAL);

    const dash = await http
      .get(`${api}/admin/dashboard`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    const k = dash.body.kpis;
    expect(k.total).toBe(k.pending + k.inProgress + k.done + k.rejected);
    expect([k.pending, k.inProgress, k.done, k.rejected]).toEqual([212, 120, 912, 40]);
  });

  itDb('rejeita credenciais erradas e exige autenticação e papel nas rotas administrativas', async () => {
    await http
      .post(`${api}/admin/auth/login`)
      .send({ email: 'triagem@cidadeemfoco.gov.br', password: 'errada' })
      .expect(401);
    await http.get(`${api}/admin/occurrences`).expect(401);
    await http
      .get(`${api}/admin/occurrences`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(403);
    await http
      .get(`${api}/admin/audit-logs`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(403);
  });

  itDb('web só para atendimento: cidadão não entra no painel e atendimento não entra como cidadão', async () => {
    // Conta de atendimento no login do cidadão (aplicativo): recusada
    const staffAsCitizen = await http
      .post(`${api}/auth/login`)
      .send({ email: 'admin@cidadeemfoco.gov.br', password: 'Senha@123' })
      .expect(403);
    expect(staffAsCitizen.body.code).toBe('STAFF_USE_ADMIN_PANEL');
    // Senha errada continua sendo 401, sem revelar o papel da conta
    await http
      .post(`${api}/auth/login`)
      .send({ email: 'admin@cidadeemfoco.gov.br', password: 'errada' })
      .expect(401);

    // Cidadão no login institucional: recusado (senha errada continua 401)
    const citizenAtPanel = await http
      .post(`${api}/admin/auth/login`)
      .send({ email: 'carlos.santos@exemplo.com.br', password: 'Senha@123' })
      .expect(403);
    expect(citizenAtPanel.body.code).toBe('CITIZEN_USE_APP');
    await http
      .post(`${api}/admin/auth/login`)
      .send({ email: 'carlos.santos@exemplo.com.br', password: 'errada' })
      .expect(401);
    // O perfil é reconhecido pela conta, sem ser informado no login
    for (const [email, role] of [
      ['admin@cidadeemfoco.gov.br', 'admin'],
      ['gestor@cidadeemfoco.gov.br', 'manager'],
      ['triagem@cidadeemfoco.gov.br', 'triage'],
      ['obras@cidadeemfoco.gov.br', 'department'],
    ]) {
      const res = await http
        .post(`${api}/admin/auth/login`)
        .send({ email, password: 'Senha@123' })
        .expect(200);
      expect(res.body.user.role).toBe(role);
    }
    // Token de cidadão não abre nenhuma rota administrativa
    for (const path of ['/admin/occurrences', '/admin/dashboard', '/admin/users']) {
      await http.get(`${api}${path}`).set('Authorization', `Bearer ${citizenToken}`).expect(403);
    }
  });

  itDb('somente o Administrador cria e lista usuários de atendimento', async () => {
    const adminLogin = await http
      .post(`${api}/admin/auth/login`)
      .send({ email: 'admin@cidadeemfoco.gov.br', password: 'Senha@123' })
      .expect(200);
    const adminToken = adminLogin.body.accessToken;
    const deptId = (
      await http.get(`${api}/admin/departments`).set('Authorization', `Bearer ${adminToken}`).expect(200)
    ).body[0].id;

    const body = {
      name: 'Nova Atendente',
      email: 'nova.atendente@cidadeemfoco.gov.br',
      password: 'Inicial@123',
      role: 'triage',
    };

    // Cidadão, atendimento, departamento e gestor: 403 (e sem token: 401)
    await http.post(`${api}/admin/users`).send(body).expect(401);
    await http.post(`${api}/admin/users`).set('Authorization', `Bearer ${citizenToken}`).send(body).expect(403);
    await http.post(`${api}/admin/users`).set('Authorization', `Bearer ${triageToken}`).send(body).expect(403);
    await http.post(`${api}/admin/users`).set('Authorization', `Bearer ${managerToken}`).send(body).expect(403);
    await http.get(`${api}/admin/users`).set('Authorization', `Bearer ${managerToken}`).expect(403);

    const as = (payload: object) =>
      http.post(`${api}/admin/users`).set('Authorization', `Bearer ${adminToken}`).send(payload);

    // Validações: papel de cidadão, senha curta e departamento obrigatório
    await as({ ...body, role: 'citizen' }).expect(400);
    await as({ ...body, password: '123' }).expect(400);
    await as({ ...body, role: 'department' }).expect(400);
    await as({ ...body, role: 'department', departmentId: '00000000-0000-4000-8000-000000000000' }).expect(400);

    const created = await as(body).expect(201);
    expect(created.body).toMatchObject({ email: body.email, role: 'triage' });
    expect(JSON.stringify(created.body)).not.toContain('Inicial@123');
    await as(body).expect(409);
    await as({ ...body, email: 'depto.novo@cidadeemfoco.gov.br', role: 'department', departmentId: deptId }).expect(201);

    // O novo usuário entra no painel (e não pelo login do cidadão)
    await http
      .post(`${api}/admin/auth/login`)
      .send({ email: body.email, password: body.password })
      .expect(200);
    await http.post(`${api}/auth/login`).send({ email: body.email, password: body.password }).expect(403);

    const list = await http.get(`${api}/admin/users`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const emails = list.body.map((u: any) => u.email);
    expect(emails).toContain(body.email);
    expect(emails).not.toContain('carlos.santos@exemplo.com.br');

    // A criação fica na auditoria, sem a senha
    const audit = await http.get(`${api}/admin/audit-logs?pageSize=20`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const entry = audit.body.items.find((a: any) => a.action === 'STAFF_USER_CREATED');
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain('Inicial@123');
  });

  itDb('cadastro pelo aplicativo cria somente cidadão, mesmo que tente informar outro papel', async () => {
    const email = `cadastro.${Date.now()}@exemplo.com.br`;
    const res = await http
      .post(`${api}/auth/register`)
      .send({ name: 'Pessoa Nova', email, password: 'Senha@123', lgpdConsent: true, role: 'admin' })
      .expect(201);
    expect(res.body.user.role).toBe('citizen');
    await http.get(`${api}/admin/users`).set('Authorization', `Bearer ${res.body.accessToken}`).expect(403);
  });

  itDb('refresh token é rotacionado: o token antigo deixa de valer', async () => {
    const login = await http
      .post(`${api}/auth/login`)
      .send({ email: 'ana.ferreira@exemplo.com.br', password: 'Senha@123' })
      .expect(200);
    const first = login.body.refreshToken;

    const renewed = await http.post(`${api}/auth/refresh`).send({ refreshToken: first }).expect(200);
    expect(renewed.body.refreshToken).not.toBe(first);

    await http.post(`${api}/auth/refresh`).send({ refreshToken: first }).expect(401);
  });

  itDb('registro sem conta gera protocolo, cifra o contato e não expõe dados pessoais', async () => {
    const created = await http
      .post(`${api}/occurrences`)
      .send(newOccurrence({ requesterName: 'Fulano de Tal', requesterContact: 'fulano@exemplo.com' }))
      .expect(201);
    expect(created.body.protocol).toMatch(new RegExp(`^CF-${new Date().getFullYear()}-\\d{6}$`));
    expect(created.body.groupedWithSimilar).toBe(false);

    const pub = await http.get(`${api}/occurrences/by-protocol/${created.body.protocol}`).expect(200);
    expect(JSON.stringify(pub.body)).not.toContain('fulano');
    expect(pub.body.requesterName).toBeUndefined();
    // Coordenadas públicas arredondadas em 3 casas
    expect(String(pub.body.latitude).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);

    const pool = new Pool({ ...baseConn, database: TEST_DB });
    const raw = await pool.query(
      'SELECT requester_contact FROM occurrences WHERE id = $1',
      [created.body.id],
    );
    await pool.end();
    expect(raw.rows[0].requester_contact).not.toContain('fulano');
    expect(raw.rows[0].requester_contact.split(':')).toHaveLength(3);

    const adminView = await http
      .get(`${api}/admin/occurrences/${created.body.id}`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    expect(adminView.body.requesterContact).toBe('fulano@exemplo.com');
  });

  itDb('PostGIS + pg_trgm agrupam relato semelhante a menos de 50 m e ignoram o distante', async () => {
    const spot = { latitude: -23.7101, longitude: -46.8101 };
    const first = await http.post(`${api}/occurrences`).send(newOccurrence(spot)).expect(201);

    // ~15 m ao norte, descrição parecida
    const near = await http
      .post(`${api}/occurrences`)
      .send(
        newOccurrence({
          ...spot,
          latitude: spot.latitude + 0.00013,
          description: 'Bueiro entupido alagando a esquina quando chove forte',
        }),
      )
      .expect(201);
    expect(near.body.groupedWithSimilar).toBe(true);

    // ~330 m ao norte: fora do raio
    const far = await http
      .post(`${api}/occurrences`)
      .send(newOccurrence({ ...spot, latitude: spot.latitude + 0.003 }))
      .expect(201);
    expect(far.body.groupedWithSimilar).toBe(false);

    const detail = await http.get(`${api}/occurrences/${first.body.id}`).expect(200);
    expect(detail.body.similarCount).toBe(1);
    expect(detail.body.similarProtocols[0].protocol).toBe(near.body.protocol);
  });

  itDb('tratamento: histórico, propagação ao grupo, auditoria, regras de reabertura e avaliação', async () => {
    const spot = { latitude: -23.7201, longitude: -46.8201 };
    const a = await http
      .post(`${api}/occurrences`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send(newOccurrence(spot))
      .expect(201);
    const b = await http.post(`${api}/occurrences`).send(newOccurrence(spot)).expect(201);
    expect(b.body.groupedWithSimilar).toBe(true);

    const auth = { Authorization: `Bearer ${triageToken}` };
    const patch = (body: object, headers = auth) =>
      http.patch(`${api}/admin/occurrences/${a.body.id}`).set(headers).send(body);

    await patch({}).expect(400);
    const rejected = await patch({ status: 'rejected' }).expect(400);
    expect(rejected.body.message).toContain('justificativa é obrigatória');

    // Só prioridade: não cria entrada no histórico visível ao cidadão
    const onlyPriority = await patch({ priority: 'alta' }).expect(200);
    expect(onlyPriority.body.history).toHaveLength(1);

    const done = await patch({ status: 'done', justification: 'Desobstrução concluída.' }).expect(200);
    expect(done.body.status).toBe('done');
    expect(done.body.history).toHaveLength(2);
    expect(done.body.closedAt).toBeTruthy();

    // O relato agrupado acompanha o estado
    const sibling = await http.get(`${api}/occurrences/${b.body.id}`).expect(200);
    expect(sibling.body.status).toBe('done');

    // Notificação in-app para o dono autenticado
    const notifications = await http
      .get(`${api}/me/notifications`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(notifications.body[0].protocol).toBe(a.body.protocol);

    // Triagem não reabre; gestor reabre e closed_at é limpo
    await patch({ status: 'in_progress' }).expect(403);
    const reopened = await patch(
      { status: 'in_progress', justification: 'Reaberta após nova vistoria.' },
      { Authorization: `Bearer ${managerToken}` },
    ).expect(200);
    expect(reopened.body.closedAt).toBeNull();
    await patch({ status: 'done', justification: 'Concluída em definitivo.' }).expect(200);

    // Avaliação: solicitação com conta exige o próprio dono
    const rate = (id: string, body: object, token?: string) => {
      const req = http.post(`${api}/occurrences/${id}/rating`);
      if (token) req.set('Authorization', `Bearer ${token}`);
      return req.send(body);
    };
    await rate(a.body.id, { stars: 5, protocol: a.body.protocol }).expect(403);
    await rate(a.body.id, { stars: 5 }, citizenToken).expect(201);
    await rate(a.body.id, { stars: 4 }, citizenToken).expect(409);
    // Solicitação sem conta exige o protocolo
    await rate(b.body.id, { stars: 4 }).expect(403);
    await rate(b.body.id, { stars: 4, protocol: b.body.protocol }).expect(201);

    const audit = await http
      .get(`${api}/admin/audit-logs?pageSize=50`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    expect(audit.body.code).toBe('FORBIDDEN_ROLE');
  });

  const adminLogin = async (email: string, password = 'Senha@123') =>
    http.post(`${api}/admin/auth/login`).send({ email, password });

  itDb('administrador edita, desativa e reativa contas de atendimento (com salvaguardas)', async () => {
    const admin = await adminLogin('admin@cidadeemfoco.gov.br').then((r) => r.body);
    const auth = { Authorization: `Bearer ${admin.accessToken}` };
    const created = await http
      .post(`${api}/admin/users`)
      .set(auth)
      .send({ name: 'Servidor Temporario', email: 'temporario@cidadeemfoco.gov.br', password: 'Inicial@123', role: 'triage' })
      .expect(201);
    const id = created.body.id;
    const login = await adminLogin('temporario@cidadeemfoco.gov.br', 'Inicial@123').then((r) => r.body);
    expect(login.accessToken).toBeTruthy();

    // Só o Administrador edita; cidadão e id inválido não existem para essa rota
    await http.patch(`${api}/admin/users/${id}`).set('Authorization', `Bearer ${triageToken}`).send({ active: false }).expect(403);
    await http.patch(`${api}/admin/users/nao-e-uuid`).set(auth).send({ active: false }).expect(404);
    const citizenId = (await http.get(`${api}/me/profile`).set('Authorization', `Bearer ${citizenToken}`)).body.id;
    await http.patch(`${api}/admin/users/${citizenId}`).set(auth).send({ role: 'admin' }).expect(404);

    // Não pode desativar nem rebaixar a si mesmo
    await http.patch(`${api}/admin/users/${admin.user.id}`).set(auth).send({ active: false }).expect(400);
    await http.patch(`${api}/admin/users/${admin.user.id}`).set(auth).send({ role: 'triage' }).expect(400);

    // Perfil Departamento exige departamento
    await http.patch(`${api}/admin/users/${id}`).set(auth).send({ role: 'department' }).expect(400);

    // Desativar bloqueia novo login e derruba a renovação da sessão aberta
    const off = await http.patch(`${api}/admin/users/${id}`).set(auth).send({ active: false }).expect(200);
    expect(off.body.active).toBe(false);
    const blocked = await adminLogin('temporario@cidadeemfoco.gov.br', 'Inicial@123');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_DISABLED');
    await http.post(`${api}/auth/refresh`).send({ refreshToken: login.refreshToken }).expect(401);
    // Senha errada continua sem revelar nada
    expect((await adminLogin('temporario@cidadeemfoco.gov.br', 'errada')).status).toBe(401);

    // Reativar e trocar para Gestor
    await http.patch(`${api}/admin/users/${id}`).set(auth).send({ active: true, role: 'manager', name: 'Servidor Gestor' }).expect(200);
    expect((await adminLogin('temporario@cidadeemfoco.gov.br', 'Inicial@123')).status).toBe(200);

    const list = await http.get(`${api}/admin/users`).set(auth).expect(200);
    expect(list.body.find((u: any) => u.id === id)).toMatchObject({ role: 'manager', active: true });
  });

  itDb('troca da própria senha exige a senha atual e encerra as sessões', async () => {
    const admin = await adminLogin('admin@cidadeemfoco.gov.br').then((r) => r.body);
    await http
      .post(`${api}/admin/users`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Troca de Senha', email: 'troca.senha@cidadeemfoco.gov.br', password: 'Inicial@123', role: 'triage' })
      .expect(201);
    const session = await adminLogin('troca.senha@cidadeemfoco.gov.br', 'Inicial@123').then((r) => r.body);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await http.post(`${api}/me/password`).send({ currentPassword: 'x', newPassword: 'Nova@12345' }).expect(401);
    await http.post(`${api}/me/password`).set(auth).send({ currentPassword: 'errada', newPassword: 'Nova@12345' }).expect(400);
    await http.post(`${api}/me/password`).set(auth).send({ currentPassword: 'Inicial@123', newPassword: 'Inicial@123' }).expect(400);
    await http.post(`${api}/me/password`).set(auth).send({ currentPassword: 'Inicial@123', newPassword: 'curta' }).expect(400);
    await http.post(`${api}/me/password`).set(auth).send({ currentPassword: 'Inicial@123', newPassword: 'Nova@12345' }).expect(201);

    expect((await adminLogin('troca.senha@cidadeemfoco.gov.br', 'Inicial@123')).status).toBe(401);
    expect((await adminLogin('troca.senha@cidadeemfoco.gov.br', 'Nova@12345')).status).toBe(200);
    await http.post(`${api}/auth/refresh`).send({ refreshToken: session.refreshToken }).expect(401);
  });

  itDb('avaliações: média, distribuição, filtro por estrelas e escopo do departamento', async () => {
    const triage = { Authorization: `Bearer ${triageToken}` };
    const all = await http.get(`${api}/admin/ratings?pageSize=50`).set(triage).expect(200);
    const { summary } = all.body;
    expect(summary.total).toBeGreaterThan(100);
    expect(summary.distribution.reduce((n: number, d: any) => n + d.count, 0)).toBe(summary.total);
    expect(summary.average).toBeGreaterThan(1);
    expect(all.body.items[0]).toHaveProperty('protocol');

    const fives = await http.get(`${api}/admin/ratings?stars=5&pageSize=50`).set(triage).expect(200);
    expect(fives.body.items.length).toBeGreaterThan(0);
    expect(fives.body.items.every((r: any) => r.stars === 5)).toBe(true);
    // O resumo ignora o filtro de estrelas
    expect(fives.body.summary.total).toBe(summary.total);

    const dept = await adminLogin('iluminacao@cidadeemfoco.gov.br').then((r) => r.body);
    const own = await http.get(`${api}/admin/ratings?pageSize=50`).set('Authorization', `Bearer ${dept.accessToken}`).expect(200);
    expect(own.body.summary.total).toBeLessThan(summary.total);
    expect(new Set(own.body.items.map((r: any) => r.departmentName))).toEqual(new Set(['Iluminação Pública']));

    await http.get(`${api}/admin/ratings`).set('Authorization', `Bearer ${citizenToken}`).expect(403);
  });

  itDb('prazos: atrasadas e a vencer, somente em aberto, com escopo do departamento', async () => {
    const triage = { Authorization: `Bearer ${triageToken}` };
    const overdue = await http.get(`${api}/admin/deadlines?scope=overdue&pageSize=50`).set(triage).expect(200);
    const dash = await http.get(`${api}/admin/dashboard`).set(triage).expect(200);
    expect(overdue.body.summary.open).toBe(dash.body.kpis.pending + dash.body.kpis.inProgress);
    expect(overdue.body.total).toBeGreaterThan(0);
    for (const item of overdue.body.items) {
      expect(['done', 'rejected']).not.toContain(item.status);
      expect(item.responseOverdue || item.executionOverdue).toBe(true);
    }
    // Mais antigas primeiro
    const dates = overdue.body.items.map((i: any) => new Date(i.executionDueAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));

    // Cria uma solicitação nova: o prazo ainda não venceu, e ela não entra em "atrasadas"
    const fresh = await http.post(`${api}/occurrences`).send(newOccurrence({ latitude: -23.9, longitude: -47.1 })).expect(201);
    const soon = await http.get(`${api}/admin/deadlines?scope=soon&pageSize=50`).set(triage).expect(200);
    expect(soon.body.items.map((i: any) => i.id)).not.toContain(fresh.body.id);
    const late = await http.get(`${api}/admin/deadlines?scope=overdue&pageSize=50`).set(triage).expect(200);
    expect(late.body.items.map((i: any) => i.id)).not.toContain(fresh.body.id);

    const dept = await adminLogin('obras@cidadeemfoco.gov.br').then((r) => r.body);
    const own = await http.get(`${api}/admin/deadlines?pageSize=50`).set('Authorization', `Bearer ${dept.accessToken}`).expect(200);
    expect(own.body.summary.open).toBeLessThan(overdue.body.summary.open + 1);
    expect(new Set(own.body.items.map((i: any) => i.departmentName))).toEqual(new Set(['Obras e Infraestrutura']));
    await http.get(`${api}/admin/deadlines`).set('Authorization', `Bearer ${citizenToken}`).expect(403);
  });

  itDb('dados abertos: público, anonimizado, em JSON e CSV', async () => {
    const json = await http.get(`${api}/public/open-data`).expect(200);
    expect(json.body.total).toBeGreaterThan(1000);
    expect(json.body.items).toHaveLength(json.body.total);
    const text = JSON.stringify(json.body);
    for (const forbidden of ['description', 'address', 'latitude', 'longitude', 'requester', 'email', 'contact']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
    expect(Object.keys(json.body.items[0]).sort()).toEqual(
      ['category', 'closedAt', 'createdAt', 'department', 'neighborhood', 'priority', 'protocol', 'status', 'statusLabel'].sort(),
    );

    const csv = await http.get(`${api}/public/open-data?format=csv`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('dados-abertos.csv');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toContain('"protocolo";"categoria";"departamento";"bairro";"estado"');
    expect(lines.length - 1).toBe(json.body.total);
  });

  itDb('sessão tem duração absoluta: o refresh renova o token mas não estende além do limite', async () => {
    const previous = process.env.SESSION_MAX_HOURS;
    process.env.SESSION_MAX_HOURS = String(6 / 3600); // 6 segundos
    try {
      const login = await http
        .post(`${api}/auth/login`)
        .send({ email: 'mariana.souza@exemplo.com.br', password: 'Senha@123' })
        .expect(200);
      const exp = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
      const sessionEnd = exp(login.body.refreshToken);

      // Renovar devolve novos tokens, mas o fim da sessão continua o mesmo
      const renewed = await http
        .post(`${api}/auth/refresh`)
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(renewed.body.refreshToken).not.toBe(login.body.refreshToken);
      expect(exp(renewed.body.refreshToken)).toBe(sessionEnd);
      expect(exp(renewed.body.accessToken)).toBeLessThanOrEqual(sessionEnd);

      // Passado o limite, nada mais renova: é preciso entrar de novo
      await new Promise((resolve) => setTimeout(resolve, 7000));
      const expired = await http
        .post(`${api}/auth/refresh`)
        .send({ refreshToken: renewed.body.refreshToken })
        .expect(401);
      expect(expired.body.code).toBe('SESSION_EXPIRED');
      await http
        .get(`${api}/me/profile`)
        .set('Authorization', `Bearer ${renewed.body.accessToken}`)
        .expect(401);
    } finally {
      if (previous === undefined) delete process.env.SESSION_MAX_HOURS;
      else process.env.SESSION_MAX_HOURS = previous;
    }
  }, 20_000);

  itDb('seed de usuários: um de cada tipo e idempotente', async () => {
    const pool = new Pool({ ...baseConn, database: TEST_DB });
    try {
      await runSeedUsers(pool);
      await runSeedUsers(pool); // rodar de novo não duplica
      const res = await pool.query(
        `SELECT role, COUNT(*)::int AS n FROM users
         WHERE email = ANY($1::text[]) GROUP BY role ORDER BY role`,
        [BASE_USERS.map((u) => u.email)],
      );
      expect(res.rows.map((r: any) => r.role).sort()).toEqual(
        ['admin', 'citizen', 'department', 'manager', 'triage'],
      );
      expect(res.rows.every((r: any) => r.n === 1)).toBe(true);
      const dept = await pool.query(
        `SELECT department_id FROM users WHERE email = 'obras@cidadeemfoco.gov.br'`,
      );
      expect(dept.rows[0].department_id).toBeTruthy();
    } finally {
      await pool.end();
    }
    // Cada conta entra pelo cliente certo
    await http.post(`${api}/auth/login`).send({ email: 'mariana.souza@exemplo.com.br', password: 'Senha@123' }).expect(200);
    for (const email of ['admin@cidadeemfoco.gov.br', 'gestor@cidadeemfoco.gov.br', 'triagem@cidadeemfoco.gov.br', 'obras@cidadeemfoco.gov.br']) {
      await http.post(`${api}/admin/auth/login`).send({ email, password: 'Senha@123' }).expect(200);
    }
  });

  itDb('redefinição de senha: link por e-mail, uso único e encerramento das sessões', async () => {
    const email = 'ana.ferreira@exemplo.com.br';
    const session = await http
      .post(`${api}/auth/login`)
      .send({ email, password: 'Senha@123' })
      .expect(200);

    // E-mail desconhecido recebe a mesma resposta e nenhum e-mail é enviado
    sentMails.length = 0;
    const unknown = await http
      .post(`${api}/auth/forgot-password`)
      .send({ email: 'ninguem@exemplo.com.br' })
      .expect(200);
    const known = await http.post(`${api}/auth/forgot-password`).send({ email }).expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe(email);

    const token = /redefinir-senha\?token=([0-9a-f]+)/.exec(sentMails[0].text)?.[1];
    expect(token).toHaveLength(64);

    await http
      .post(`${api}/auth/reset-password`)
      .send({ token: 'f'.repeat(64), password: 'NovaSenha@456' })
      .expect(400);
    await http
      .post(`${api}/auth/reset-password`)
      .send({ token, password: '123' })
      .expect(400);
    await http
      .post(`${api}/auth/reset-password`)
      .send({ token, password: 'NovaSenha@456' })
      .expect(200);
    // O link não pode ser reutilizado
    await http
      .post(`${api}/auth/reset-password`)
      .send({ token, password: 'Outra@789' })
      .expect(400);

    await http.post(`${api}/auth/login`).send({ email, password: 'Senha@123' }).expect(401);
    await http.post(`${api}/auth/login`).send({ email, password: 'NovaSenha@456' }).expect(200);
    // A sessão aberta antes da troca não pode mais ser renovada
    await http
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);
  });

  itDb('busca por protocolo funciona na lista administrativa e na lista do cidadão', async () => {
    const admin = await http
      .get(`${api}/admin/occurrences?q=cf-2026-004812`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    expect(admin.body.items.map((o: any) => o.protocol)).toEqual(['CF-2026-004812']);

    const login = await http
      .post(`${api}/auth/login`)
      .send({ email: 'mariana.souza@exemplo.com.br', password: 'Senha@123' })
      .expect(200);
    const mine = await http
      .get(`${api}/me/occurrences?q=004812`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(mine.body.items.map((o: any) => o.protocol)).toEqual(['CF-2026-004812']);

    // "%" digitado é texto literal, não curinga
    const literal = await http
      .get(`${api}/admin/occurrences?q=%25`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    expect(literal.body.total).toBe(0);
  });

  itDb('perfil Departamento só enxerga e trata solicitações do próprio departamento', async () => {
    const login = await http
      .post(`${api}/admin/auth/login`)
      .send({ email: 'iluminacao@cidadeemfoco.gov.br', password: 'Senha@123' })
      .expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const list = await http.get(`${api}/admin/occurrences?pageSize=50`).set(auth).expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(new Set(list.body.items.map((o: any) => o.departmentName))).toEqual(
      new Set(['Iluminação Pública']),
    );

    const other = await http
      .get(`${api}/admin/occurrences?category=drenagem&pageSize=1`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    await http.get(`${api}/admin/occurrences/${other.body.items[0].id}`).set(auth).expect(403);
  });

  itDb('upload valida a assinatura real do arquivo e relatórios exportam CSV e PDF', async () => {
    const fake = await http
      .post(`${api}/occurrences`)
      .field('categoryId', categoryId)
      .field('description', 'Tentativa de envio de arquivo que não é imagem')
      .field('addressText', 'Rua dos Testes, 300')
      .field('neighborhood', 'Centro')
      .field('latitude', '-23.7301')
      .field('longitude', '-46.8301')
      .attach('photos', Buffer.from('isto não é uma imagem'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    expect(fake.body.code).toBe('INVALID_PHOTO_TYPE');

    const csv = await http
      .get(`${api}/admin/reports/by-department?format=csv`)
      .set('Authorization', `Bearer ${triageToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('"Departamento";"Demandas"');

    const pdf = await http
      .get(`${api}/admin/reports/monthly?format=pdf`)
      .set('Authorization', `Bearer ${triageToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
