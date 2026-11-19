import { test, expect, Page } from '@playwright/test';

/**
 * Mapa administrativo: toda ocorrência do filtro precisa ser alcançável e tratável,
 * mesmo quando os marcadores se sobrepõem. Requer a stack no ar com o seed carregado.
 */
const API = process.env.E2E_API_URL || 'http://localhost:3000/api/v1';

let cached: { body: any } | null = null;
async function adminSession(page: Page) {
  if (!cached) {
    const res = await page.request.post(`${API}/admin/auth/login`, {
      data: { email: 'admin@cidadeemfoco.gov.br', password: 'Senha@123' },
    });
    cached = { body: await res.json() };
  }
  const { body } = cached;
  await page.addInitScript(
    ([tokens, user]) => {
      localStorage.setItem('cf_auth_tokens_v1', tokens);
      localStorage.setItem('cf_auth_user_v1', user);
    },
    [JSON.stringify({ accessToken: body.accessToken, refreshToken: body.refreshToken }), JSON.stringify(body.user)],
  );
  return body.accessToken as string;
}

const tileZoom = (page: Page) =>
  page.evaluate(() =>
    Math.max(
      ...Array.from(document.querySelectorAll<HTMLImageElement>('img.leaflet-tile')).map((i) =>
        Number(i.src.split('/').slice(-3)[0]),
      ),
    ),
  );

test('1. Com filtro de bairro, todas as ocorrências aparecem no mapa e na lista, e todas podem ser tratadas', async ({
  page,
}) => {
  const token = await adminSession(page);
  const api = await (
    await page.request.get(`${API}/admin/map?neighborhood=Centro&status=open`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const expected: Array<{ id: string; protocol: string; latitude: number; longitude: number }> = api.points;
  expect(expected.length).toBeGreaterThan(5);

  await page.goto('/admin/mapa');
  await page.getByLabel('Bairro').selectOption('Centro');
  await expect(
    page.getByRole('heading', { name: `Ocorrências neste filtro (${expected.length.toLocaleString('pt-BR')})` }),
  ).toBeVisible();

  // Lista: todas as ocorrências do filtro, cada uma com seu botão "Tratar" apontando para a ocorrência certa
  const rows = page.getByRole('list', { name: 'Ocorrências neste filtro' }).getByRole('listitem');
  await expect(rows).toHaveCount(expected.length);
  const hrefs = await page
    .getByRole('list', { name: 'Ocorrências neste filtro' })
    .getByRole('link', { name: /^Tratar / })
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(new Set(hrefs)).toEqual(new Set(expected.map((p) => `/admin/solicitacoes/${p.id}`)));

  // Mapa: o enquadramento mostra todos os marcadores dentro da área visível
  const map = page.getByRole('region', { name: /Mapa administrativo/ });
  await page.waitForTimeout(1200);
  const box = (await map.boundingBox())!;
  const pins = await page.locator('.leaflet-marker-icon[title^="CF-"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );
  expect(pins).toHaveLength(expected.length);
  for (const p of pins) {
    expect(p.x).toBeGreaterThan(box.x);
    expect(p.x).toBeLessThan(box.x + box.width);
    expect(p.y).toBeGreaterThan(box.y);
    expect(p.y).toBeLessThan(box.y + box.height);
  }
  // Nenhuma bolha de total cobre os marcadores quando o mapa está aproximado
  await expect(page.locator('.leaflet-marker-icon[title*="ocorrências em"]')).toHaveCount(0);

  // Escolher da lista destaca a ocorrência e abre o tratamento
  const last = expected[expected.length - 1];
  await page.getByRole('button', { name: `Mostrar ${last.protocol} no mapa` }).click();
  const selected = page.locator('h2', { hasText: 'Ocorrência selecionada' }).locator('..');
  await expect(selected.getByText(last.protocol)).toBeVisible();
  await selected.getByRole('button', { name: 'Tratar ocorrência' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/solicitacoes/${last.id}$`));
  await expect(page.getByRole('heading', { name: 'Tratar ocorrência' })).toBeVisible();
  await expect(page.getByText(last.protocol).first()).toBeVisible();
});

test('2. Clicar no marcador seleciona a ocorrência; o link "Tratar" da lista abre qualquer uma', async ({ page }) => {
  const token = await adminSession(page);
  const api = await (
    await page.request.get(`${API}/admin/map?neighborhood=Centro&status=open`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  await page.goto('/admin/mapa');
  await page.getByLabel('Bairro').selectOption('Centro');
  await page.waitForTimeout(1500);

  // Clicar em um marcador seleciona a ocorrência. dispatchEvent: marcadores no mesmo endereço ficam
  // sobrepostos (por isso existe a lista), então o clique é entregue ao marcador escolhido.
  const pin = api.points[Math.floor(api.points.length / 3)];
  await page.locator(`.leaflet-marker-icon[title^="${pin.protocol}"]`).dispatchEvent('click');
  const selected = page.locator('h2', { hasText: 'Ocorrência selecionada' }).locator('..');
  await expect(selected.getByText(pin.protocol)).toBeVisible();

  const middle = api.points[Math.floor(api.points.length / 2)];
  await page.getByRole('link', { name: `Tratar ${middle.protocol}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/solicitacoes/${middle.id}$`));
});

test('3. Sem filtro, clicar no total do bairro aproxima o mapa e mostra as ocorrências dele', async ({ page }) => {
  await adminSession(page);
  await page.goto('/admin/mapa');
  await expect(page.getByRole('combobox', { name: 'Estado' })).toHaveValue('open');
  const cluster = page.locator('.leaflet-marker-icon[title*="ocorrências em Centro"]');
  await expect(cluster).toBeVisible();
  await page.waitForTimeout(800);
  const before = await tileZoom(page);

  await cluster.click();
  await page.waitForTimeout(1500);
  const after = await tileZoom(page);
  expect(after).toBeGreaterThan(before);
  expect(after).toBeGreaterThanOrEqual(14);
  // Aproximado (zoom 12 ou mais), as bolhas somem e os marcadores individuais ficam acessíveis
  await expect(page.locator('.leaflet-marker-icon[title*="ocorrências em"]')).toHaveCount(0);
  expect(await page.locator('.leaflet-marker-icon[title^="CF-"]').count()).toBeGreaterThan(0);
});

test('4. Mapa do cidadão: a bolha de total não cobre os marcadores ao filtrar por bairro', async ({ page }) => {
  await page.goto('/mapa');
  await page.getByRole('button', { name: 'Centro', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('.leaflet-marker-icon[title*="ocorrências em"]')).toHaveCount(0);
  expect(await page.locator('.leaflet-marker-icon[title^="CF-"]').count()).toBeGreaterThan(0);
});

test('5. Dashboard: clicar no total do bairro aproxima e mostra os chamados; o marcador abre o tratamento', async ({
  page,
}) => {
  await adminSession(page);
  await page.goto('/admin');
  const cluster = page.locator('.leaflet-marker-icon[title*="ocorrências em Centro"]');
  await expect(cluster).toBeVisible();
  await page.waitForTimeout(800);
  const before = await tileZoom(page);

  await cluster.click();
  await page.waitForTimeout(1500);
  expect(await tileZoom(page)).toBeGreaterThan(before);
  // Os marcadores dos chamados aparecem (antes sumiam: o mapa só tinha os totais)
  const pins = page.locator('.leaflet-marker-icon[title^="CF-"]');
  expect(await pins.count()).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-marker-icon[title*="ocorrências em"]')).toHaveCount(0);

  await pins.first().dispatchEvent('click');
  await expect(page).toHaveURL(/\/admin\/solicitacoes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Tratar ocorrência' })).toBeVisible();
});

test('6. Dashboard de departamento: a mesma navegação mostra só os chamados do departamento', async ({ page }) => {
  const res = await page.request.post(`${API}/admin/auth/login`, {
    data: { email: 'iluminacao@cidadeemfoco.gov.br', password: 'Senha@123' },
  });
  const body = await res.json();
  await page.addInitScript(
    ([tokens, user]) => {
      localStorage.setItem('cf_auth_tokens_v1', tokens);
      localStorage.setItem('cf_auth_user_v1', user);
    },
    [JSON.stringify({ accessToken: body.accessToken, refreshToken: body.refreshToken }), JSON.stringify(body.user)],
  );
  const own = await (
    await page.request.get(`${API}/admin/map?status=open`, { headers: { Authorization: `Bearer ${body.accessToken}` } })
  ).json();
  const hood = own.clusters[0].neighborhood as string;

  await page.goto('/admin');
  const cluster = page.locator(`.leaflet-marker-icon[title*="ocorrências em ${hood}"]`);
  await expect(cluster).toBeVisible();
  await cluster.click();
  await page.waitForTimeout(1500);
  const shown = await page.locator('.leaflet-marker-icon[title^="CF-"]').evaluateAll((els) => els.map((e) => e.getAttribute('title')!.split(' ')[0]));
  expect(shown.length).toBeGreaterThan(0);
  const ownProtocols = new Set(own.points.map((p: any) => p.protocol));
  for (const protocol of shown) expect(ownProtocols.has(protocol)).toBe(true);
});
