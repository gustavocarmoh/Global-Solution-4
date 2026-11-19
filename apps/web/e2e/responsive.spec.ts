import { test, expect, Page } from '@playwright/test';

/**
 * Responsividade: todas as páginas em celulares, tablet, notebook e monitores.
 * Mede o que importa para quem usa: a página não rola para os lados, o conteúdo
 * não se estica em tela muito larga e o menu do painel se adapta ao tamanho.
 * Requer a stack no ar (API + web) com o seed carregado.
 */
const API = process.env.E2E_API_URL || 'http://localhost:3000/api/v1';

const VIEWPORTS = [
  { name: 'celular pequeno 320x568', width: 320, height: 568 },
  { name: 'celular 390x844', width: 390, height: 844 },
  { name: 'celular deitado 844x390', width: 844, height: 390 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'notebook 1366x768', width: 1366, height: 768 },
  { name: 'monitor full HD 1920x1080', width: 1920, height: 1080 },
  { name: 'monitor ultrawide 2560x1080', width: 2560, height: 1080 },
  { name: 'monitor 2K 2560x1440', width: 2560, height: 1440 },
  { name: 'monitor 4K 3840x2160', width: 3840, height: 2160 },
];

/** Escala esperada da interface por largura de tela (veja --ui-zoom em tokens.css). */
const expectedZoom = (width: number) => (width >= 3600 ? 2 : width >= 3000 ? 1.5 : width >= 2400 ? 1.25 : 1);

const PUBLIC_PAGES = [
  '/',
  '/mapa',
  '/registrar',
  '/solicitacoes',
  '/solicitacoes/CF-2026-004812',
  '/transparencia',
  '/dados-abertos',
  '/admin/entrar',
];

const ADMIN_PAGES = [
  '/admin',
  '/admin/solicitacoes',
  '/admin/solicitacoes/:id',
  '/admin/prazos',
  '/admin/mapa',
  '/admin/avaliacoes',
  '/admin/relatorios',
  '/admin/departamentos',
  '/admin/usuarios',
  '/admin/auditoria',
  '/admin/conta',
];

/** Um único login para a suíte inteira (o token dura 15 min; evita o limite de logins por minuto). */
let cachedSession: { body: any; occurrenceId: string } | null = null;

async function adminSession(page: Page) {
  if (!cachedSession) {
    const res = await page.request.post(`${API}/admin/auth/login`, {
      data: { email: 'admin@cidadeemfoco.gov.br', password: 'Senha@123' },
    });
    const body = await res.json();
    const list = await page.request.get(`${API}/admin/occurrences?pageSize=1`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    cachedSession = { body, occurrenceId: (await list.json()).items[0].id as string };
  }
  const { body, occurrenceId } = cachedSession;
  await page.addInitScript(
    ([tokens, user]) => {
      localStorage.setItem('cf_auth_tokens_v1', tokens);
      localStorage.setItem('cf_auth_user_v1', user);
    },
    [
      JSON.stringify({ accessToken: body.accessToken, refreshToken: body.refreshToken }),
      JSON.stringify(body.user),
    ],
  );
  return occurrenceId;
}

/**
 * Elementos que passam da borda direita da tela sem estarem dentro de uma área que rola
 * (tabelas rolam por dentro, o mapa tem os próprios controles). Pega conteúdo cortado
 * mesmo quando a página em si não rola para os lados.
 */
const clippedElements = (page: Page) =>
  page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= limit) continue;
      let ignored = false;
      for (let p: HTMLElement | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (
          p.matches('.sr-only, .skip-link, .leaflet-container') ||
          cs.display === 'none' ||
          (p !== el && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'))
        ) {
          ignored = true;
          break;
        }
      }
      if (!ignored) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} "${(el.textContent || '').trim().slice(0, 24)}" (direita em ${Math.round(r.right)}px)`);
      }
    }
    return out.slice(0, 3);
  });

/** Folga de 1px para arredondamentos de subpixel. */
const measure = (page: Page) =>
  page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    // clientWidth já desconta a barra de rolagem (innerWidth não)
    viewWidth: document.documentElement.clientWidth,
    // largura de layout (sem a escala de monitor grande), para comparar com os limites do desenho
    mainWidth: Math.round((document.querySelector('main') as HTMLElement | null)?.offsetWidth ?? 0),
    zoom: parseFloat(getComputedStyle(document.documentElement).zoom) || 1,
  }));

for (const vp of VIEWPORTS) {
  test(`páginas públicas sem rolagem lateral e bem dimensionadas — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const problems: string[] = [];
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const m = await measure(page);
      if (m.docWidth > m.viewWidth + 1) problems.push(`${path}: rola para os lados (${m.docWidth}px > ${m.viewWidth}px)`);
      if (m.mainWidth > 1400) problems.push(`${path}: conteúdo esticado (${m.mainWidth}px)`);
      if (m.zoom !== expectedZoom(vp.width)) problems.push(`${path}: escala da interface ${m.zoom}, esperado ${expectedZoom(vp.width)}`);
      for (const c of await clippedElements(page)) problems.push(`${path}: conteúdo cortado: ${c}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test(`painel administrativo sem rolagem lateral e com menu adaptado — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const occurrenceId = await adminSession(page);
    const problems: string[] = [];
    const compact = vp.width <= 960;

    for (const raw of ADMIN_PAGES) {
      const path = raw.replace(':id', occurrenceId);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const m = await measure(page);
      if (m.docWidth > m.viewWidth + 1) problems.push(`${raw}: rola para os lados (${m.docWidth}px > ${m.viewWidth}px)`);
      for (const c of await clippedElements(page)) problems.push(`${raw}: conteúdo cortado: ${c}`);

      const toggle = page.getByRole('button', { name: /^Menu/ });
      const nav = page.getByRole('navigation', { name: 'Menu administrativo' });
      if (compact) {
        if (!(await toggle.isVisible())) problems.push(`${raw}: falta o botão de menu`);
        if (await nav.isVisible()) problems.push(`${raw}: menu aberto sem ninguém pedir`);
      } else {
        if (await toggle.isVisible()) problems.push(`${raw}: botão de menu em tela larga`);
        if (!(await nav.isVisible())) problems.push(`${raw}: menu lateral não aparece`);
        // O painel usa a largura de monitores grandes (tabelas e gráficos), mas não além de 1600px
        if (m.mainWidth > 1600) problems.push(`${raw}: conteúdo esticado (${m.mainWidth}px)`);
      }
    }

    // Em tela pequena, o menu abre, leva a outra página e fecha sozinho
    if (compact) {
      await page.goto('/admin');
      const toggle = page.getByRole('button', { name: /^Menu/ });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('navigation', { name: 'Menu administrativo' }).getByRole('link', { name: 'Prazos' }).click();
      await expect(page).toHaveURL(/\/admin\/prazos/);
      await expect(page.getByRole('navigation', { name: 'Menu administrativo' })).toBeHidden();
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

/* ---------------------------------------------------------------------------
 * Monitores grandes e o menu lateral
 * ------------------------------------------------------------------------- */
const DESKTOPS = VIEWPORTS.filter((v) => v.width >= 1366 && v.height >= 768);

for (const vp of DESKTOPS) {
  test(`menu lateral e conteúdo não se mexem ao trocar de página — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const occurrenceId = await adminSession(page);
    const seen = new Map<string, string>();
    const pages = ADMIN_PAGES.map((p) => p.replace(':id', occurrenceId));

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const pos = await page.evaluate(() => {
        // posição e largura (a altura do conteúdo muda de página para página, e isso é normal)
        const r = (sel: string, withHeight = false) => {
          const b = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
          return [b.left, b.top, b.width, ...(withHeight ? [b.height] : [])].map(Math.round).join(',');
        };
        return {
          shell: r('.admin-shell'),
          sidebar: r('.admin-sidebar', true), // o menu tem a altura da tela em todas as páginas
          main: r('.admin-main').split(',').slice(0, 2).join(','), // canto do conteúdo
          scrollbar: window.innerWidth - document.documentElement.clientWidth,
        };
      });
      for (const key of ['shell', 'sidebar', 'main'] as const) {
        const prev = seen.get(key);
        if (prev === undefined) seen.set(key, pos[key]);
        else expect(pos[key], `${key} mudou de lugar em ${path}`).toBe(prev);
      }
      // O espaço da barra de rolagem é reservado em todas as páginas, curtas ou longas
      const gutter = seen.get('scrollbar');
      if (gutter === undefined) seen.set('scrollbar', String(pos.scrollbar));
      else expect(String(pos.scrollbar), `barra de rolagem em ${path}`).toBe(gutter);
    }
  });

  test(`interface ocupa a tela e fica legível — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await adminSession(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => {
      const shell = (document.querySelector('.admin-shell') as HTMLElement).getBoundingClientRect();
      const sidebar = (document.querySelector('.admin-sidebar') as HTMLElement).getBoundingClientRect();
      const link = document.querySelector('.admin-sidebar a') as HTMLElement;
      return {
        shellShare: shell.width / document.documentElement.clientWidth,
        sidebarHeight: Math.round(sidebar.height),
        viewHeight: window.innerHeight,
        // tamanho do texto como o usuário vê (com a escala)
        textPx: parseFloat(getComputedStyle(link).fontSize) * (parseFloat(getComputedStyle(document.documentElement).zoom) || 1),
      };
    });
    // O painel não fica pequeno e perdido no meio de um monitor grande
    if (vp.width >= 2400) expect(m.shellShare).toBeGreaterThan(0.8);
    // Texto com tamanho proporcional ao monitor: ~16px em Full HD, maior em 2K e 4K
    expect(m.textPx).toBeGreaterThanOrEqual(15 * expectedZoom(vp.width));
    // O menu ocupa exatamente a altura da tela (a escala não o corta nem o estica)
    expect(Math.abs(m.sidebarHeight - m.viewHeight)).toBeLessThanOrEqual(1);
  });
}

for (const vp of VIEWPORTS.filter((v) => v.width >= 1920 && v.height >= 1080)) {
  test(`mapa recebe o clique no ponto certo com a escala da tela — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/registrar');
    await page.getByRole('radio', { name: /Pavimentação/i }).click();
    await page.getByRole('button', { name: /Continuar para descrição/i }).click();
    await page.getByLabel(/Descrição do problema/i).fill('Buraco profundo na pista, teste de mapa.');
    await page.getByRole('button', { name: /Continuar para localização/i }).click();

    const map = page.getByRole('region', { name: /Mapa interativo/i });
    await expect(map).toBeVisible();
    // As fontes da web podem terminar de carregar e deslocar o layout: espera antes de medir
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    // Dois cliques em lugares diferentes: o marcador precisa acompanhar cada um
    for (const [fx, fy] of [[0.3, 0.4], [0.7, 0.6]]) {
      const box = (await map.boundingBox())!; // remedido a cada clique
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
      const pin = await page.locator('.leaflet-marker-icon').last().boundingBox();
      // A ponta do marcador (centro da base) fica sobre o clique
      expect(Math.abs(pin!.x + pin!.width / 2 - x), `x do marcador (${vp.name})`).toBeLessThanOrEqual(4);
      expect(Math.abs(pin!.y + pin!.height - y), `y do marcador (${vp.name})`).toBeLessThanOrEqual(4);
    }
  });
}
