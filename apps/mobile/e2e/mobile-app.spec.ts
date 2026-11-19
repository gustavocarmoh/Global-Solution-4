import { test, expect, Page } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3000/api/v1';
const PASSWORD = 'Senha@123';
const EMAIL = 'carlos.santos@exemplo.com.br';

test.describe.configure({ mode: 'serial' });

/** O app abre na tela de login; "Continuar sem conta" leva ao uso anônimo. */
async function openAnonymous(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar sem conta' }).click();
}

// O rótulo acessível das abas inclui o ícone (ex.: "📄 Solicitações")
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`${name}$`) });

async function login(page: Page, password = PASSWORD) {
  await page.goto('/');
  await page.getByLabel('E-mail *').fill(EMAIL);
  await page.getByLabel('Senha *').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('cadastro pela tela do app cria uma conta de cidadão e já entra', async ({ page }) => {
  const email = `app.${Date.now()}@exemplo.com.br`;
  await page.goto('/');
  await tab(page, 'Criar conta').click();

  // Sem aceitar o termo da LGPD, não cria
  await page.getByLabel('Nome *').fill('Pessoa do Aplicativo');
  await page.getByLabel('E-mail *').fill(email);
  await page.getByLabel('Senha *').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText(/termo de consentimento LGPD/)).toBeVisible();

  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText('Olá, Pessoa')).toBeVisible();

  const login = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).user.role).toBe('citizen');

  // E-mail repetido é recusado
  const dup = await page.request.post(`${API}/auth/register`, {
    data: { name: 'Pessoa do Aplicativo', email, password: PASSWORD, lgpdConsent: true },
  });
  expect(dup.status()).toBe(409);
});

test('conta de atendimento não entra no aplicativo (usa o painel web)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail *').fill('admin@cidadeemfoco.gov.br');
  await page.getByLabel('Senha *').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/apenas o painel administrativo web/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cf_mobile_session_v1'))).toBeNull();
});

test('início carrega categorias e registros recentes da API', async ({ page }) => {
  const categories = await (await page.request.get(`${API}/categories`)).json();
  await openAnonymous(page);
  for (const cat of categories) {
    await expect(
      page.getByRole('button', { name: `Registrar problema na categoria ${cat.name}` }),
    ).toBeVisible();
  }
  await expect(page.getByText('Registros recentes na cidade')).toBeVisible();
  await expect(page.getByText('Olá, cidadão(ã)')).toBeVisible();
});

test('login recusa senha errada e aceita a correta; a sessão sobrevive a recarregar', async ({
  page,
}) => {
  await login(page, 'senha-errada');
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();

  await page.getByLabel('Senha *').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Olá, Carlos')).toBeVisible();
  await expect(page.getByText('Sua última solicitação')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Olá, Carlos')).toBeVisible();
});

test('solicitações da conta: lista real, busca por protocolo e detalhe com histórico', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByText('Olá, Carlos')).toBeVisible();

  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cf_mobile_session_v1') || '{}').tokens?.accessToken,
  );
  const mine = await (
    await page.request.get(`${API}/me/occurrences?status=all&pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  expect(mine.total).toBeGreaterThan(0);
  const target = mine.items[3];

  await tab(page, 'Solicitações').click();
  await expect(page.getByText(mine.items[0].protocol).first()).toBeVisible();

  await page.getByLabel('Buscar na lista').fill(target.protocol);
  await expect(page.getByText(mine.items[0].protocol)).toHaveCount(0);
  await page.getByText(target.protocol).first().click();

  await expect(page.getByText('Histórico de estados')).toBeVisible();
  await expect(page.getByText(target.protocol).first()).toBeVisible();
  await expect(page.getByText(/Responsável:/).first()).toBeVisible();
});

test('consulta pública por protocolo sem login e erro para protocolo inexistente', async ({
  page,
}) => {
  await openAnonymous(page);
  await tab(page, 'Solicitações').click();
  await expect(page.getByText('Entre para ver suas solicitações')).toBeVisible();

  const field = page.getByLabel('Consultar por protocolo (sem necessidade de conta)');
  await field.fill('CF-1999-000001');
  await page.getByRole('button', { name: /Consultar protocolo/ }).click();
  await expect(page.getByText(/Nenhuma solicitação encontrada/)).toBeVisible();

  await field.fill('cf-2026-004812');
  await page.getByRole('button', { name: /Consultar protocolo/ }).click();
  await page.getByText('CF-2026-004812').first().click();
  await expect(page.getByText('Histórico de estados')).toBeVisible();
});

test('registro em 4 passos sem conta cria a solicitação de verdade na API', async ({ page }) => {
  await openAnonymous(page);
  await tab(page, 'Registrar').click();

  await page.getByRole('radio', { name: /Sinalização/ }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();

  const description = `Placa de pare caída, teste mobile ${Date.now()}`;
  await page.getByLabel('Descrição do problema *').fill(description);
  await page.getByRole('button', { name: 'Continuar para localização' }).click();

  // Endereço é obrigatório
  await page.getByRole('button', { name: 'Revisar solicitação' }).click();
  await expect(page.getByText(/Informe o endereço da solicitação/)).toBeVisible();
  await page.getByLabel('Endereço ou altura aproximada *').fill('Rua do Teste Mobile, 45');
  await page.getByRole('button', { name: 'Zona Norte', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar solicitação' }).click();

  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Solicitação registrada')).toBeVisible();

  const protocol = (await page.getByLabel(/^Protocolo CF-/).innerText()).trim();
  expect(protocol).toMatch(/^CF-\d{4}-\d{6}$/);

  const saved = await (await page.request.get(`${API}/occurrences/by-protocol/${protocol}`)).json();
  expect(saved.description).toBe(description);
  expect(saved.neighborhood).toBe('Zona Norte');
  expect(saved.categoryName).toBe('Sinalização');
  expect(saved.status).toBe('received');

  await page.getByRole('button', { name: 'Acompanhar' }).click();
  await expect(page.getByText('Histórico de estados')).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
});

test('mapa usa os pontos e totais por bairro da API e aplica filtros', async ({ page }) => {
  const all = await (await page.request.get(`${API}/map/occurrences`)).json();
  const total = all.clusters.reduce((acc: number, c: any) => acc + c.count, 0);

  await openAnonymous(page);
  await tab(page, 'Mapa').click();
  await expect(page.getByText(new RegExp(`de ${total} ocorrências neste filtro`))).toBeVisible();

  const centro = await (
    await page.request.get(`${API}/map/occurrences?neighborhood=Centro&status=open`)
  ).json();
  await page.getByRole('button', { name: 'Centro', exact: true }).click();
  await page.getByRole('button', { name: 'Em aberto', exact: true }).click();
  await expect(
    page.getByText(new RegExp(`de ${centro.clusters[0].count} ocorrências neste filtro`)),
  ).toBeVisible();
});

test('perfil: preferência e dados são gravados na conta; sair encerra a sessão', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByText('Olá, Carlos')).toBeVisible();
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cf_mobile_session_v1') || '{}').tokens?.accessToken,
  );
  const prefs = () =>
    page.request
      .get(`${API}/me/preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json());
  const before = await prefs();

  await tab(page, 'Perfil').click();
  await page.getByRole('switch', { name: 'Alto contraste' }).click();
  await expect.poll(async () => (await prefs()).highContrastPref).toBe(!before.highContrastPref);
  // Restaura o valor original
  await page.getByRole('switch', { name: 'Alto contraste' }).click();
  await expect.poll(async () => (await prefs()).highContrastPref).toBe(before.highContrastPref);

  const phone = `(11) 9${String(Date.now()).slice(-4)}-0000`;
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Telefone').fill(phone);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados atualizados com sucesso.')).toBeVisible();
  const profile = await (
    await page.request.get(`${API}/me/profile`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  expect(profile.phone).toBe(phone);

  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cf_mobile_session_v1'))).toBeNull();
});

test('sem sessão o app abre no login; sair volta ao login e invalida o refresh token no servidor', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();

  await login(page);
  await expect(page.getByText('Olá, Carlos')).toBeVisible();
  const refreshToken = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cf_mobile_session_v1') || '{}').tokens?.refreshToken,
  );

  await tab(page, 'Perfil').click();
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();

  // O refresh token do aparelho deixou de valer no servidor
  const reuse = await page.request.post(`${API}/auth/refresh`, { data: { refreshToken } });
  expect(reuse.status()).toBe(401);

  // Recarregar não restaura a sessão encerrada
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();
});

test('sessão encerrada pelo servidor leva de volta ao login com aviso', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Olá, Carlos')).toBeVisible();

  // Simula tokens vencidos/invalidados (ex.: passou das 24h)
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('cf_mobile_session_v1') || '{}');
    session.tokens = { accessToken: 'invalido', refreshToken: 'invalido' };
    localStorage.setItem('cf_mobile_session_v1', JSON.stringify(session));
  });
  await page.reload();
  await expect(page.getByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cf_mobile_session_v1'))).toBeNull();
});

// ---------------------------------------------------------------------------
// Adaptação a telas: celulares pequenos e grandes, tablet e monitor.
// ---------------------------------------------------------------------------
const SCREEN_SIZES = [
  { name: 'celular pequeno 320x568', width: 320, height: 568 },
  { name: 'celular 390x844', width: 390, height: 844 },
  { name: 'celular deitado 844x390', width: 844, height: 390 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'monitor 1920x1080', width: 1920, height: 1080 },
];

for (const size of SCREEN_SIZES) {
  test(`app se adapta à tela — ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const problems: string[] = [];
    const check = async (where: string) => {
      const m = await page.evaluate(() => {
        const tabs = document.querySelector('[role="tablist"]') as HTMLElement | null;
        return {
          doc: document.documentElement.scrollWidth,
          view: window.innerWidth,
          tabs: tabs ? Math.round(tabs.getBoundingClientRect().width) : null,
        };
      });
      if (m.doc > m.view + 1) problems.push(`${where}: rola para os lados (${m.doc}px > ${m.view}px)`);
      // Em tela larga o app fica em coluna estreita, centralizada
      if (m.tabs !== null && m.tabs > 721) problems.push(`${where}: barra de abas esticada (${m.tabs}px)`);
    };

    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Criar conta' })).toBeVisible();
    await check('login');
    await tab(page, 'Criar conta').click();
    await check('cadastro');
    await page.getByRole('button', { name: 'Continuar sem conta' }).click();

    for (const name of ['Início', 'Mapa', 'Registrar', 'Solicitações', 'Perfil']) {
      await tab(page, name).click();
      await page.waitForTimeout(250);
      await check(name);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
