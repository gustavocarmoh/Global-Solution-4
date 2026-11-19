import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Card, ErrorBlock, LoadingBlock } from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { BarList, ColumnChart } from '../../components/DataVisuals';
import { CategoryIcon } from '../../components/CategoryIcons';
import { apiFetch } from '../../lib/api';

const fmt = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—';

export const PublicTransparencyPage: React.FC = () => {
  const summaryQuery = useQuery<any>({
    queryKey: ['public-stats-summary'],
    queryFn: () => apiFetch('/public/stats'),
  });
  const neighborhoodQuery = useQuery<any[]>({
    queryKey: ['public-stats-neighborhood'],
    queryFn: () => apiFetch('/public/stats/by-neighborhood'),
  });
  const categoryQuery = useQuery<any[]>({
    queryKey: ['public-stats-category'],
    queryFn: () => apiFetch('/public/stats/by-category'),
  });
  const monthlyQuery = useQuery<any[]>({
    queryKey: ['public-stats-monthly'],
    queryFn: () => apiFetch('/public/stats/monthly'),
  });

  const queries = [summaryQuery, neighborhoodQuery, categoryQuery, monthlyQuery];
  const isLoading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error;

  const summary = summaryQuery.data;
  const byNeighborhood = neighborhoodQuery.data ?? [];
  const byCategoryRaw = categoryQuery.data ?? [];
  const monthlySeries = monthlyQuery.data ?? [];

  const byCategoryWithIcons = byCategoryRaw.map((item: any) => ({
    label: item.label,
    value: item.value,
    icon: <CategoryIcon icon={item.icon} slug={item.slug} size={16} />,
  }));

  return (
    <div style={{ minHeight: 'calc(100vh / var(--ui-zoom))', backgroundColor: 'var(--surface-100)' }}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>

      <PublicHeader />

      <main
        id="main-content"
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        <div>
          <h1 className="h1">Cidade em Foco em números</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
            {summary
              ? `Período de referência: ${summary.period}`
              : 'Indicadores calculados a partir das solicitações registradas'}
          </p>
        </div>

        {isLoading && <LoadingBlock label="Carregando indicadores públicos..." />}
        {!isLoading && firstError && (
          <ErrorBlock
            error={firstError}
            onRetry={() => queries.forEach((q) => q.refetch())}
          />
        )}

        {summary && (
          <>

        {/* 4 cartões de KPI calculados no banco */}
        <section
          aria-label="Indicadores principais de transparência"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <Card>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Registradas
            </div>
            <div
              className="mono"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--ink)',
                marginTop: 6,
              }}
            >
              {fmt(summary.registered)}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Solucionadas
            </div>
            <div
              className="mono"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--focus-ring)',
                marginTop: 6,
              }}
            >
              {fmt(summary.resolved)}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Tempo médio de resolução
            </div>
            <div
              className="mono"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--ink)',
                marginTop: 6,
              }}
            >
              {summary.avgResolutionDays === null
                ? '—'
                : `${String(summary.avgResolutionDays).replace('.', ',')} dias`}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Satisfação
            </div>
            <div
              className="mono"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--brand)',
                marginTop: 6,
              }}
            >
              {summary.satisfactionPct === null ? '—' : `${summary.satisfactionPct}%`}
            </div>
          </Card>
        </section>

        {/* Lista de barras "Por bairro" e "Por categoria" (com ícones e botão "Ver dados em tabela") */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
            gap: 'var(--space-5)',
          }}
        >
          <BarList title="Por bairro" items={byNeighborhood} />
          <BarList title="Por categoria" items={byCategoryWithIcons} />
        </div>

        {/* Gráfico de colunas agrupadas "Por mês" (registradas x solucionadas, maio a outubro) */}
        <ColumnChart
          title="Por mês (registradas x solucionadas)"
          series={monthlySeries}
        />
          </>
        )}

        {/* Nota de Privacidade LGPD */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--surface-300)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--fs-small)',
            color: 'var(--ink-muted)',
          }}
        >
          <ShieldCheck size={18} aria-hidden="true" color="var(--brand)" />
          <strong>Dados agregados. Nenhuma informação pessoal é publicada.</strong>
        </div>
      </main>
    </div>
  );
};
