import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import { CitizenHomePage } from '../pages/citizen/CitizenHomePage';
import { CitizenMapPage } from '../pages/citizen/CitizenMapPage';
import { CitizenRegisterPage } from '../pages/citizen/CitizenRegisterPage';
import { CitizenRequestsPage } from '../pages/citizen/CitizenRequestsPage';
import { CitizenDetailPage } from '../pages/citizen/CitizenDetailPage';
import { PublicTransparencyPage } from '../pages/public/PublicTransparencyPage';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminRequestsPage } from '../pages/admin/AdminRequestsPage';
import { AdminTreatOccurrencePage } from '../pages/admin/AdminTreatOccurrencePage';
import { AdminMapPage } from '../pages/admin/AdminMapPage';
import { AdminReportsPage } from '../pages/admin/AdminReportsPage';
import { AdminDepartmentsPage } from '../pages/admin/AdminDepartmentsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminDeadlinesPage } from '../pages/admin/AdminDeadlinesPage';
import { AdminRatingsPage } from '../pages/admin/AdminRatingsPage';
import { AdminAuditPage } from '../pages/admin/AdminAuditPage';
import { AdminAccountPage } from '../pages/admin/AdminAccountPage';
import { PublicOpenDataPage } from '../pages/public/PublicOpenDataPage';

// Mock para o InteractiveMap no ambiente JSDOM (Leaflet requer layout de canvas/DOM real)
vi.mock('../components/InteractiveMap', () => ({
  InteractiveMap: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div role="region" aria-label={ariaLabel || 'Mapa interativo'}>
      Mapa carregado
    </div>
  ),
}));

/* ---------------------------------------------------------------------------
 * Respostas da API no formato real dos endpoints. As telas não têm dados
 * embutidos: a auditoria precisa avaliá-las já com conteúdo carregado.
 * ------------------------------------------------------------------------- */
const OCC_ID = '3f2b8a52-6d1e-4a7c-9b1f-0c2d4e6f8a10';
const DEPT_ID = '7a1c2e3f-4b5d-4c6e-8f70-112233445566';
const CAT_ID = '11111111-1111-4111-8111-111111111101';

const category = {
  id: CAT_ID,
  slug: 'pavimentacao',
  name: 'Pavimentação',
  icon: 'road',
  departmentId: DEPT_ID,
  departmentName: 'Obras e Infraestrutura',
  responseDeadlineDays: 3,
  executionDeadlineDays: 10,
  active: true,
};

const listItem = {
  id: OCC_ID,
  protocol: 'CF-2026-004812',
  title: 'Buraco profundo na faixa da direita',
  addressText: 'Rua Quinze de Novembro, 412 - Centro',
  neighborhood: 'Centro',
  status: 'done',
  priority: 'alta',
  groupId: null,
  createdAt: '2026-05-02T10:15:00.000Z',
  categoryId: CAT_ID,
  categoryName: 'Pavimentação',
  categorySlug: 'pavimentacao',
  categoryIcon: 'road',
  departmentId: DEPT_ID,
  departmentName: 'Obras e Infraestrutura',
  similarCount: 2,
  latitude: -23.551,
  longitude: -46.633,
};

const detail = {
  ...listItem,
  description: 'Buraco profundo na faixa da direita, próximo ao cruzamento.',
  referencePoint: 'Em frente à padaria',
  closedAt: '2026-05-09T10:15:00.000Z',
  photos: [
    {
      id: 'ph-1',
      url: '/api/v1/photos/view/placeholder/pavimentacao-1.svg',
      thumbUrl: '/api/v1/photos/view/placeholder/pavimentacao-1-thumb.svg',
    },
  ],
  history: [
    {
      id: 'h-1',
      fromStatus: null,
      toStatus: 'received',
      justification: 'Solicitação registrada na plataforma Cidade em Foco.',
      actorName: 'Atendimento Municipal',
      createdAt: '2026-05-02T10:15:00.000Z',
    },
    {
      id: 'h-2',
      fromStatus: 'in_progress',
      toStatus: 'done',
      justification: 'Serviço concluído e vistoriado pela equipe técnica.',
      actorName: 'Obras e Infraestrutura',
      createdAt: '2026-05-09T10:15:00.000Z',
    },
  ],
  rating: null,
  similarProtocols: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', protocol: 'CF-2026-004813', createdAt: '2026-05-02T11:00:00.000Z' },
  ],
  isMine: true,
  canRate: true,
  requesterName: 'Mariana Souza',
  requesterContact: 'mariana.souza@exemplo.com.br',
  hasAccount: true,
  assistedByName: null,
};

const clusters = [
  { neighborhood: 'Centro', count: 456, latitude: -23.5505, longitude: -46.6333 },
  { neighborhood: 'Zona Norte', count: 375, latitude: -23.5015, longitude: -46.625 },
];

const API_FIXTURES: Array<[RegExp, unknown]> = [
  [/\/categories$/, [category]],
  [/\/admin\/categories$/, [category]],
  [
    /\/admin\/deadlines$/,
    {
      summary: { open: 332, responseOverdue: 40, executionOverdue: 190, dueSoon: 12 },
      items: [
        {
          ...listItem,
          status: 'in_progress',
          responseOverdue: false,
          executionOverdue: true,
          daysLate: 12,
          responseDueAt: '2026-10-05T10:00:00.000Z',
          executionDueAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    },
  ],
  [
    /\/admin\/ratings$/,
    {
      summary: {
        total: 554,
        average: 4.2,
        positivePct: 83,
        distribution: [
          { stars: 5, count: 300 },
          { stars: 4, count: 160 },
          { stars: 3, count: 94 },
          { stars: 2, count: 0 },
          { stars: 1, count: 0 },
        ],
      },
      items: [
        {
          id: 'r-1',
          stars: 5,
          comment: 'Atendimento rápido.',
          createdAt: '2026-05-09T10:15:00.000Z',
          occurrenceId: OCC_ID,
          protocol: 'CF-2026-004812',
          neighborhood: 'Centro',
          categoryName: 'Pavimentação',
          departmentName: 'Obras e Infraestrutura',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    },
  ],
  [
    /\/admin\/audit-logs$/,
    {
      items: [
        {
          id: 'a-1',
          actorName: 'Helena Vasconcelos (Admin)',
          actorRole: 'admin',
          action: 'ADMIN_LOGIN',
          entity: 'users',
          entityId: 'abcdef12-0000-4000-8000-000000000001',
          before: null,
          after: { role: 'admin' },
          ip: '127.0.0.1',
          createdAt: '2026-11-17T10:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  ],
  [
    /\/public\/open-data$/,
    {
      generatedAt: '2026-11-17T10:00:00.000Z',
      total: 1284,
      items: [
        {
          protocol: 'CF-2026-004812',
          category: 'Pavimentação',
          department: 'Obras e Infraestrutura',
          neighborhood: 'Centro',
          status: 'done',
          statusLabel: 'Concluída',
          priority: 'alta',
          createdAt: '2026-05-02',
          closedAt: '2026-05-09',
        },
      ],
    },
  ],
  [
    /\/admin\/users$/,
    [{ id: 'u-1', name: 'Camila Nogueira', email: 'triagem@cidadeemfoco.gov.br', role: 'triage', active: true, departmentName: null }],
  ],
  [
    /\/admin\/departments$/,
    [
      {
        id: DEPT_ID,
        name: 'Obras e Infraestrutura',
        responseDeadlineDays: 3,
        active: true,
        categories: [{ id: CAT_ID, name: 'Pavimentação', slug: 'pavimentacao' }],
      },
    ],
  ],
  [/\/map\/occurrences/, { points: [listItem], clusters }],
  [/\/admin\/map/, { points: [listItem], clusters }],
  [/\/me\/occurrences/, { items: [listItem], total: 1, page: 1, pageSize: 20 }],
  [
    /\/me\/profile$/,
    {
      id: 'user-1',
      name: 'Mariana Souza',
      email: 'mariana.souza@exemplo.com.br',
      phone: '(11) 98765-4321',
      role: 'citizen',
      textSizePref: 'default',
      highContrastPref: false,
      reduceMotionPref: false,
      emailNotifications: true,
    },
  ],
  [/\/admin\/occurrences\/[0-9a-f-]{36}$/, detail],
  [
    /\/admin\/occurrences(\?|$)/,
    { items: [listItem], total: 1, pendingCount: 0, inProgressCount: 0, page: 1, pageSize: 8 },
  ],
  [/\/occurrences\/(by-protocol\/)?[^/]+$/, detail],
  [
    /\/public\/stats$/,
    {
      period: 'Maio a Outubro de 2026',
      registered: 1284,
      resolved: 912,
      avgResolutionDays: 7.2,
      satisfactionPct: 83,
      totalRatings: 554,
    },
  ],
  [/\/public\/stats\/by-neighborhood$/, [{ label: 'Centro', value: 456 }]],
  [
    /\/public\/stats\/by-category$/,
    [{ label: 'Pavimentação', slug: 'pavimentacao', icon: 'road', value: 260 }],
  ],
  [/\/public\/stats\/monthly$/, [{ month: 'Mai/26', registered: 214, resolved: 161 }]],
  [
    /\/admin\/dashboard$/,
    {
      period: 'Maio a Outubro de 2026',
      kpis: {
        total: 1284,
        pending: 212,
        inProgress: 120,
        done: 912,
        rejected: 40,
        avgTriageDays: 1.7,
        triageBaselineDays: 2.25,
        triageChangePct: -24,
        satisfactionPct: 83,
        totalRatings: 554,
        duplicates: 168,
      },
      recurringProblems: [
        {
          categoryName: 'Pavimentação',
          categorySlug: 'pavimentacao',
          categoryIcon: 'road',
          neighborhood: 'Centro',
          count: 101,
        },
      ],
      geographicClusters: clusters,
      demandsByDepartment: [{ label: 'Obras e Infraestrutura', value: 644 }],
    },
  ],
  [
    /\/admin\/kpis$/,
    [
      {
        id: 'kpi-1',
        indicator: 'Solicitações registradas',
        objective: 'Volume total captado na plataforma',
        target: 'Monitoramento contínuo',
        result: '1.284',
        status: 'em acompanhamento',
      },
      {
        id: 'kpi-7',
        indicator: 'Satisfação do cidadão',
        objective: 'Avaliações positivas (4 ou 5 estrelas) nas concluídas',
        target: '≥ 80% positivas',
        result: '83%',
        status: 'atingida',
      },
    ],
  ],
];

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input).split('?')[0];
  const match = API_FIXTURES.find(([pattern]) => pattern.test(url));
  if (!match) {
    return new Response(
      JSON.stringify({ code: 'NOT_FOUND', message: `Sem fixture para ${url}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response(JSON.stringify(match[1]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

function signIn(role: 'admin') {
  localStorage.setItem(
    'cf_auth_tokens_v1',
    JSON.stringify({ accessToken: 'test-access', refreshToken: 'test-refresh' }),
  );
  localStorage.setItem(
    'cf_auth_user_v1',
    JSON.stringify({
      id: 'user-1',
      name: role === 'admin' ? 'Helena Vasconcelos (Admin)' : 'Mariana Souza',
      email: role === 'admin' ? 'admin@cidadeemfoco.gov.br' : 'mariana.souza@exemplo.com.br',
      role,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithProviders(ui: React.ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

async function assertNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // O JSDOM não calcula layout nem cores renderizadas: contraste NÃO é coberto por esta
      // suíte e precisa ser verificado em navegador real (ex.: Lighthouse ou axe DevTools).
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
}

describe('Auditoria de acessibilidade estrutural (axe-core, sem contraste) — as 19 telas com dados carregados', () => {
  const screens: Array<{
    name: string;
    path: string;
    element: React.ReactElement;
    as?: 'admin';
    /** Texto que só aparece depois que os dados da API foram renderizados. */
    loaded?: string | RegExp;
  }> = [
    { name: '2. Início (/)', path: '/', element: <CitizenHomePage /> , loaded: 'CF-2026-004812' },
    { name: '3. Mapa (/mapa)', path: '/mapa', element: <CitizenMapPage /> , loaded: /mais recentes de/ },
    { name: '4. Registrar (/registrar)', path: '/registrar', element: <CitizenRegisterPage /> , loaded: 'Pavimentação' },
    { name: '5. Solicitações (/solicitacoes)', path: '/solicitacoes', element: <CitizenRequestsPage /> , loaded: 'Consultar solicitação' },
    {
      name: '6. Detalhe (/solicitacoes/:id)',
      path: '/solicitacoes/CF-2026-004812',
      element: (
        <Routes>
          <Route path="/solicitacoes/:id" element={<CitizenDetailPage />} />
        </Routes>
      ),
      loaded: 'Histórico de andamento',
    },
    { name: '8. Transparência (/transparencia)', path: '/transparencia', element: <PublicTransparencyPage /> , loaded: '1.284' },
    { name: '9. Entrar administrativo (/admin/entrar)', path: '/admin/entrar', element: <AdminLoginPage /> },
    { name: '10. Dashboard (/admin)', path: '/admin', element: <AdminDashboardPage /> , as: 'admin', loaded: 'Problemas recorrentes' },
    { name: '11. Solicitações Admin (/admin/solicitacoes)', path: '/admin/solicitacoes', element: <AdminRequestsPage /> , as: 'admin', loaded: 'CF-2026-004812' },
    {
      name: '12. Tratar ocorrência (/admin/solicitacoes/:id)',
      path: `/admin/solicitacoes/${OCC_ID}`,
      element: (
        <Routes>
          <Route
            path="/admin/solicitacoes/:id"
            element={<AdminTreatOccurrencePage />}
          />
        </Routes>
      ),
      as: 'admin',
      loaded: 'Tratar ocorrência',
    },
    { name: '13. Mapa administrativo (/admin/mapa)', path: '/admin/mapa', element: <AdminMapPage /> , as: 'admin', loaded: 'Ocorrência selecionada' },
    { name: '14. Relatórios (/admin/relatorios)', path: '/admin/relatorios', element: <AdminReportsPage /> , as: 'admin', loaded: 'Satisfação do cidadão' },
    { name: '17. Prazos e atrasos (/admin/prazos)', path: '/admin/prazos', element: <AdminDeadlinesPage />, as: 'admin', loaded: 'Resposta atrasada' },
    { name: '18. Avaliações (/admin/avaliacoes)', path: '/admin/avaliacoes', element: <AdminRatingsPage />, as: 'admin', loaded: 'Distribuição das notas' },
    { name: '19. Auditoria (/admin/auditoria)', path: '/admin/auditoria', element: <AdminAuditPage />, as: 'admin', loaded: 'Login institucional' },
    { name: '20. Minha conta (/admin/conta)', path: '/admin/conta', element: <AdminAccountPage />, as: 'admin', loaded: 'Alterar senha' },
    { name: '21. Dados abertos (/dados-abertos)', path: '/dados-abertos', element: <PublicOpenDataPage />, loaded: /Prévia/ },
    { name: '16. Usuários de atendimento (/admin/usuarios)', path: '/admin/usuarios', element: <AdminUsersPage />, as: 'admin', loaded: 'Contas cadastradas' },
    { name: '15. Departamentos e categorias (/admin/departamentos)', path: '/admin/departamentos', element: <AdminDepartmentsPage /> , as: 'admin', loaded: 'Obras e Infraestrutura' },
  ];

  for (const screen of screens) {
    it(`Não deve possuir violações de acessibilidade (axe-core) na tela: ${screen.name}`, async () => {
      if (screen.as) signIn(screen.as);
      const { container, queryClient, findAllByText } = renderWithProviders(
        screen.element,
        screen.path,
      );
      if (screen.loaded) {
        // Garante que a auditoria roda sobre a tela com dados, não sobre o "Carregando..."
        expect((await findAllByText(screen.loaded)).length).toBeGreaterThan(0);
      }
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      await assertNoAxeViolations(container);
    });
  }
});
