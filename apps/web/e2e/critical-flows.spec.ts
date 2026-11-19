import { readFileSync } from 'node:fs';
import { test, expect, Page } from '@playwright/test';

/**
 * Fluxos críticos de ponta a ponta no navegador, contra a API e o banco reais.
 * Pré-requisitos: infraestrutura no ar (`npm run infra:up`), banco migrado e
 * populado (`npm run db:migrate && npm run db:seed`) e API rodando (`npm run dev:api`).
 * O servidor do front é iniciado pelo próprio Playwright (playwright.config.ts).
 */
const API = process.env.E2E_API_URL || 'http://localhost:3000/api/v1';
const PASSWORD = 'Senha@123';

test.describe.configure({ mode: 'serial' });

let protocol = '';

async function staffLogin(page: Page, password = PASSWORD, email = 'triagem@cidadeemfoco.gov.br') {
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByLabel(/Senha/).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('API está no ar e com o seed carregado', async ({ request }) => {
  const health = await request.get(`${API}/health`);
  expect(health.ok(), 'Suba a API antes de rodar os testes E2E').toBeTruthy();
  const stats = await (await request.get(`${API}/public/stats`)).json();
  expect(stats.registered).toBeGreaterThan(0);
});

test('1. Cidadão registra problema sem conta em 4 passos e consulta pelo protocolo', async ({
  page,
}) => {
  await page.goto('/registrar');
  await expect(page.getByText(/Em emergência,\s*ligue/i)).toBeVisible();

  // Passo 1: categorias vêm da API
  await page.getByRole('radio', { name: /Pavimentação/i }).click();
  await page.getByRole('button', { name: /Continuar para descrição/i }).click();

  // Passo 2
  await page
    .getByLabel(/Descrição do problema/i)
    .fill(`Buraco profundo na pista, teste automatizado ${Date.now()}`);
  await page.getByRole('button', { name: /Continuar para localização/i }).click();

  // Passo 3: endereço é obrigatório (não há mais valor pré-preenchido)
  await page.getByRole('button', { name: /Revisar solicitação/i }).click();
  await expect(page.getByText(/Informe o endereço/i)).toBeVisible();
  await page.getByLabel(/Endereço ou altura aproximada/i).fill('Rua dos Testes E2E, 123');
  await page.getByRole('button', { name: /Revisar solicitação/i }).click();

  // Passo 4
  await expect(page.getByText(/4\. Revise os dados antes de enviar/i)).toBeVisible();
  await page.getByRole('button', { name: /Enviar solicitação/i }).click();

  await expect(page.getByRole('heading', { name: 'Solicitação registrada' })).toBeVisible();
  protocol = (await page.locator('.mono', { hasText: /^CF-\d{4}-\d{6}$/ }).first().innerText()).trim();
  expect(protocol).toMatch(/^CF-\d{4}-\d{6}$/);

  // O protocolo existe de verdade na API
  const apiRes = await page.request.get(`${API}/occurrences/by-protocol/${protocol}`);
  expect(apiRes.ok()).toBeTruthy();
  expect((await apiRes.json()).status).toBe('received');

  // Consulta pública pelo protocolo, sem login
  await page.goto('/solicitacoes');
  await page.getByLabel(/Consultar por protocolo/i).fill(protocol);
  await page.getByRole('button', { name: /Consultar/i }).click();
  await page.getByRole('link', { name: /Abrir linha do tempo completa/i }).click();
  await expect(page.getByText(protocol).first()).toBeVisible();
  await expect(page.getByText('Recebida').first()).toBeVisible();

  // Protocolo inexistente mostra erro (sem dados simulados)
  await page.goto('/solicitacoes');
  await page.getByLabel(/Consultar por protocolo/i).fill('CF-1999-000001');
  await page.getByRole('button', { name: /Consultar/i }).click();
  await expect(page.getByText(/Nenhuma solicitação encontrada/i)).toBeVisible();
});

test('2. Painel administrativo exige sessão e recusa senha errada', async ({ page }) => {
  await page.goto('/admin/solicitacoes');
  await expect(page).toHaveURL(/\/admin\/entrar/);

  await staffLogin(page, 'senha-incorreta');
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/entrar/);
});

test('3. Triagem trata a ocorrência, o histórico é gravado e o cidadão vê o novo estado', async ({
  page,
}) => {
  test.skip(!protocol, 'depende do protocolo criado no teste 1');

  await staffLogin(page);
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);

  await page.getByLabel('Busca').fill(protocol);
  await expect(page.getByRole('cell', { name: protocol })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir' }).click();
  await expect(page.getByRole('heading', { name: 'Tratar ocorrência' })).toBeVisible();

  // Sem alteração, o botão fica desabilitado
  const save = page.getByRole('button', { name: /Salvar e notificar/i });
  await expect(save).toBeDisabled();

  // "Não procedente" sem justificativa é bloqueado
  await page.getByLabel(/Estado \(7 opções\)/i).selectOption('rejected');
  await expect(
    page.getByText(/Para Não procedente, a justificativa é obrigatória/i).first(),
  ).toBeVisible();
  await expect(save).toBeDisabled();

  // Avança para "Em andamento" com justificativa
  await page.getByLabel(/Estado \(7 opções\)/i).selectOption('in_progress');
  await page.getByLabel(/Justificativa/i).fill('Equipe técnica acionada para vistoria e reparo.');
  await save.click();
  await expect(page.getByText(/cidadãos associados notificados/i)).toBeVisible();

  // Confere na API pública: estado e histórico reais
  const apiRes = await page.request.get(`${API}/occurrences/by-protocol/${protocol}`);
  const body = await apiRes.json();
  expect(body.status).toBe('in_progress');
  expect(body.history.at(-1).justification).toContain('Equipe técnica acionada');

  // E na tela do cidadão
  await page.goto(`/solicitacoes/${protocol}`);
  await expect(page.getByText('Em andamento').first()).toBeVisible();
  await expect(page.getByText(/Equipe técnica acionada/)).toBeVisible();
});

test('4. Transparência pública mostra os mesmos números da API', async ({ page }) => {
  const stats = await (await page.request.get(`${API}/public/stats`)).json();
  await page.goto('/transparencia');
  await expect(
    page.getByText(stats.registered.toLocaleString('pt-BR'), { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(stats.resolved.toLocaleString('pt-BR'), { exact: true }).first(),
  ).toBeVisible();
});

test('5. Web é só para atendimento: cidadão não entra e não há tela de conta do cidadão', async ({
  page,
}) => {
  // Conta de cidadão no login institucional é recusada
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill('carlos.santos@exemplo.com.br');
  await page.getByLabel(/Senha/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/Contas de cidadão acessam apenas o aplicativo/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/entrar/);

  // Rotas de conta do cidadão não existem mais no web
  for (const path of ['/entrar', '/perfil']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/transparencia/);
  }
});

test('6. Só o administrador cria usuários; o novo usuário entra no painel e redefine a senha por e-mail', async ({
  page,
}) => {
  const MAILPIT = process.env.E2E_MAILPIT_URL || 'http://localhost:8025';
  const email = `atendente.${Date.now()}@cidadeemfoco.gov.br`;

  // Triagem não vê o item "Usuários" e é barrada na rota
  await staffLogin(page);
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
  await page.goto('/admin/usuarios');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Sair' }).click();

  // Administrador cria o usuário pela tela
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill('admin@cidadeemfoco.gov.br');
  await page.getByLabel(/Senha/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('link', { name: 'Usuários' }).click();
  await expect(page.getByRole('heading', { name: 'Usuários de atendimento' })).toBeVisible();

  await page.getByLabel('Nome completo').fill('Atendente de Teste');
  await page.getByLabel('E-mail institucional').fill(email);
  await page.getByLabel(/^Perfil\b/).selectOption('department');
  await page.getByLabel(/^Departamento\b/).selectOption({ index: 1 });
  await page.getByLabel('Senha inicial').fill('Inicial@123');
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByText(/Usuário Atendente de Teste criado/)).toBeVisible();
  await expect(page.getByRole('cell', { name: email })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();

  // O novo usuário redefine a senha pelo link enviado por e-mail (Mailpit)
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByRole('button', { name: 'Esqueci a senha' }).click();
  await expect(page.getByText(/enviaremos um link para redefinir a senha/i)).toBeVisible();

  let link = '';
  await expect
    .poll(async () => {
      const list = await (
        await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
      ).json();
      const id = list.messages?.[0]?.ID;
      if (!id) return '';
      const message = await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      link = /https?:\/\/\S+\/redefinir-senha\?token=[0-9a-f]+/.exec(message.Text)?.[0] ?? '';
      return link;
    })
    .toContain('/redefinir-senha?token=');

  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel('Nova senha', { exact: false }).first().fill('Nova@45678');
  await page.getByLabel('Confirmar nova senha').fill('Nova@45678');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText(/Senha redefinida com sucesso/i)).toBeVisible();

  const oldLogin = await page.request.post(`${API}/admin/auth/login`, {
    data: { email, password: 'Inicial@123' },
  });
  expect(oldLogin.status()).toBe(401);

  await page.getByRole('main').getByRole('link', { name: 'Acesso institucional' }).click();
  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByLabel(/Senha/).fill('Nova@45678');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);

  // O token do atendente não cria usuários
  const token = (
    await (
      await page.request.post(`${API}/admin/auth/login`, {
        data: { email, password: 'Nova@45678' },
      })
    ).json()
  ).accessToken;
  const denied = await page.request.post(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Outro Usuario', email: 'x@y.gov.br', password: 'Inicial@123', role: 'triage' },
  });
  expect(denied.status()).toBe(403);
});

test('7. Login/logout do painel: sair invalida a sessão e sessão vencida volta ao login com aviso', async ({
  page,
}) => {
  await staffLogin(page);
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);
  // Quem já está logado não vê a tela de login de novo
  await page.goto('/admin/entrar');
  await expect(page).toHaveURL(/\/admin$/);

  const refreshToken = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cf_auth_tokens_v1') || '{}').refreshToken,
  );
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/admin\/entrar/);
  expect(await page.evaluate(() => localStorage.getItem('cf_auth_tokens_v1'))).toBeNull();
  const reuse = await page.request.post(`${API}/auth/refresh`, { data: { refreshToken } });
  expect(reuse.status()).toBe(401);

  // Painel exige login de novo
  await page.goto('/admin/solicitacoes');
  await expect(page).toHaveURL(/\/admin\/entrar/);

  // Sessão invalidada no servidor (tokens inválidos): volta ao login e avisa
  await staffLogin(page);
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);
  await page.evaluate(() => {
    localStorage.setItem(
      'cf_auth_tokens_v1',
      JSON.stringify({ accessToken: 'invalido', refreshToken: 'invalido' }),
    );
  });
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/entrar/);
  await expect(page.getByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
});

test('8. Páginas públicas têm layout de site (cabeçalho com navegação, conteúdo largo), não de celular', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  for (const path of ['/', '/mapa', '/solicitacoes', '/transparencia']) {
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav.getByRole('link', { name: 'Mapa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acesso institucional' })).toBeVisible();
    // Sem barra de abas fixa no rodapé
    await expect(page.locator('.citizen-tabbar')).toHaveCount(0);
  }
  await page.goto('/');
  const box = await page.locator('main').boundingBox();
  expect(box!.width).toBeGreaterThan(900);
  await page.goto('/mapa');
  expect((await page.locator('main').boundingBox())!.width).toBeGreaterThan(900);
});

async function adminApiToken(page: Page): Promise<string> {
  const res = await page.request.post(`${API}/admin/auth/login`, {
    data: { email: 'admin@cidadeemfoco.gov.br', password: PASSWORD },
  });
  return (await res.json()).accessToken;
}

test('9. Prazos, avaliações e auditoria: telas com dados reais e auditoria só para o administrador', async ({
  page,
}) => {
  await staffLogin(page); // triagem

  await page.getByRole('link', { name: 'Prazos' }).click();
  await expect(page.getByRole('heading', { name: 'Prazos e atrasos' })).toBeVisible();
  await expect(page.getByText('Execução atrasada').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tratar' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Vencem em breve' }).click();
  await expect(page.getByRole('button', { name: 'Vencem em breve' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Atrasadas' }).click();
  await page.getByRole('link', { name: 'Tratar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Tratar ocorrência' })).toBeVisible();

  await page.getByRole('link', { name: 'Avaliações' }).click();
  await expect(page.getByRole('heading', { name: 'Avaliações do atendimento' })).toBeVisible();
  await expect(page.getByText('Nota média')).toBeVisible();
  await page.getByRole('button', { name: '5 estrelas' }).click();
  const ratings = page.locator('[role="img"][aria-label^="Avaliação:"]');
  await expect(ratings.first()).toBeVisible();
  await expect(
    page.locator('[role="img"][aria-label^="Avaliação:"]:not([aria-label="Avaliação: 5 de 5 estrelas"])'),
  ).toHaveCount(0);

  // Triagem não vê nem acessa a auditoria
  await expect(page.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);
  await page.goto('/admin/auditoria');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Sair' }).click();

  // Administrador vê a trilha, inclusive o próprio login
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill('admin@cidadeemfoco.gov.br');
  await page.getByLabel(/Senha/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('link', { name: 'Auditoria' }).click();
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Login institucional' }).first()).toBeVisible();
  await page.getByText('Ver alteração').first().click();
  await expect(page.getByText('Depois').first()).toBeVisible();
});

test('10. Minha conta (nome e senha) e desativação de usuário pelo administrador', async ({ page }) => {
  const stamp = Date.now();
  const email = `conta.${stamp}@cidadeemfoco.gov.br`;
  const newName = `Conta Renomeada ${stamp}`;
  const token = await adminApiToken(page);
  const created = await page.request.post(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Conta de Teste', email, password: 'Inicial@123', role: 'triage' },
  });
  expect(created.ok()).toBeTruthy();

  // O próprio usuário edita o nome e troca a senha
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByLabel(/Senha/).fill('Inicial@123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('link', { name: 'Minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
  await expect(page.getByText(/Sua sessão atual vale até/)).toBeVisible();

  await page.getByLabel('Nome', { exact: true }).fill(newName);
  await page.getByRole('button', { name: 'Salvar dados' }).click();
  await expect(page.getByText('Dados atualizados com sucesso.')).toBeVisible();

  await page.getByLabel('Senha atual').fill('errada-errada');
  await page.getByLabel(/^Nova senha/).fill('Nova@12345');
  await page.getByLabel('Confirmar nova senha').fill('Nova@12345');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByText('A senha atual não confere.')).toBeVisible();

  await page.getByLabel('Senha atual').fill('Inicial@123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page).toHaveURL(/\/admin\/entrar/);
  await expect(page.getByText(/Senha alterada com sucesso/)).toBeVisible();

  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByLabel(/Senha/).fill('Nova@12345');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/solicitacoes/);
  await expect(page.getByText(newName).first()).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();

  // O administrador desativa a conta e ela deixa de entrar
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill('admin@cidadeemfoco.gov.br');
  await page.getByLabel(/Senha/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('link', { name: 'Usuários' }).click();
  await page.getByRole('button', { name: `Desativar ${newName}` }).click();
  await expect(page.getByText(`${newName} foi desativado`)).toBeVisible();
  await expect(page.getByRole('button', { name: `Reativar ${newName}` })).toBeVisible();
  // Não pode desativar a si mesmo
  await expect(page.getByRole('button', { name: /Desativar Helena/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Sair' }).click();

  const blocked = await page.request.post(`${API}/admin/auth/login`, {
    data: { email, password: 'Nova@12345' },
  });
  expect(blocked.status()).toBe(403);
  await page.goto('/admin/entrar');
  await page.getByLabel(/E-mail institucional/).fill(email);
  await page.getByLabel(/Senha/).fill('Nova@12345');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/conta está desativada/)).toBeVisible();
});

test('11. Dados abertos: prévia, download em CSV anonimizado', async ({ page }) => {
  await page.goto('/dados-abertos');
  await expect(page.getByRole('heading', { name: 'Dados abertos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Prévia — [\d.]+ solicitações na base/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Baixar planilha/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/dados-abertos\.csv$/);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text.startsWith('\uFEFF"protocolo";"categoria"')).toBe(true);
  expect(text.split('\r\n').length).toBeGreaterThan(1000);
  expect(text.toLowerCase()).not.toContain('latitude');
});
