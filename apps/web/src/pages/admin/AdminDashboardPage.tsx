import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/DesignSystem';
import { BarList } from '../../components/DataVisuals';
import { CategoryIcon } from '../../components/CategoryIcons';
import { InteractiveMap } from '../../components/InteractiveMap';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../lib/api';

const fmt = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  // Ocorrências em aberto com posição: o mini-mapa mostra os totais por bairro e, ao aproximar, os chamados
  const mapQuery = useQuery({
    queryKey: ['admin-map', 'dashboard'],
    queryFn: () => apiFetch('/admin/map?status=open'),
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/admin/dashboard'),
  });

  if (isLoading || error || !data) {
    return (
      <AdminLayout>
        <h1 className="h1" style={{ marginBottom: 'var(--space-4)' }}>
          Dashboard
        </h1>
        {isLoading ? (
          <LoadingBlock label="Carregando indicadores..." />
        ) : (
          <ErrorBlock error={error} onRetry={() => refetch()} />
        )}
      </AdminLayout>
    );
  }

  const kpis = data.kpis;
  const triagePct: number | null = kpis.triageChangePct;

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Dashboard</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Visão executiva de atendimento municipal, triagem, recorrências e desempenho das secretarias
          {data.period ? ` · ${data.period}` : ''}
        </p>
      </div>

      {/* Linha de 8 KPIs calculados no banco */}
      <section
        aria-label="Indicadores operacionais do município"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(max(min(100%, 220px), calc((100% - 3 * var(--space-3)) / 4)), 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Total</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {fmt(kpis.total)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Soma consistente: {kpis.pending} + {kpis.inProgress} + {kpis.done} + {kpis.rejected}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Pendentes</div>
          <div
            className="mono"
            style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand)', marginTop: 4 }}
          >
            {kpis.pending.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Recebidas, em análise e encaminhadas
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Em andamento</div>
          <div
            className="mono"
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--status-progress-fg)',
              marginTop: 4,
            }}
          >
            {kpis.inProgress.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Programadas e equipes em campo
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Concluídas</div>
          <div
            className="mono"
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--status-done-fg)',
              marginTop: 4,
            }}
          >
            {kpis.done.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Atendimentos finalizados
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Não procedentes</div>
          <div
            className="mono"
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--status-rejected-fg)',
              marginTop: 4,
            }}
          >
            {kpis.rejected.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Com justificativa obrigatória
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
            Tempo médio de triagem
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {kpis.avgTriageDays === null
              ? '—'
              : `${String(kpis.avgTriageDays).replace('.', ',')} dia`}
          </div>
          <div
            style={{
              fontSize: 11,
              color:
                triagePct !== null && triagePct > 0
                  ? 'var(--status-rejected-fg)'
                  : 'var(--brand)',
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {triagePct === null
              ? 'Sem triagens registradas'
              : `${triagePct > 0 ? '+' : triagePct < 0 ? '−' : ''}${Math.abs(triagePct)}% sobre a linha de base (${String(kpis.triageBaselineDays).replace('.', ',')} dia)`}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Satisfação</div>
          <div
            className="mono"
            style={{ fontSize: 28, fontWeight: 700, color: 'var(--brand)', marginTop: 4 }}
          >
            {kpis.satisfactionPct === null ? '—' : `${kpis.satisfactionPct}%`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            {kpis.totalRatings > 0
              ? `Avaliações positivas (4 e 5 estrelas) em ${fmt(kpis.totalRatings)}`
              : 'Ainda sem avaliações'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Duplicidades</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {kpis.duplicates.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
            Relatos semelhantes agrupados
          </div>
        </Card>
      </section>

      {/* Cartões: Problemas recorrentes + Agrupamentos geográficos + Demandas por departamento */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {/* Cartão Problemas recorrentes */}
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 className="h3">Problemas recorrentes</h2>
            <Link
              to="/admin/solicitacoes"
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--brand)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Ver todas
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {data.recurringProblems.length === 0 && (
              <EmptyBlock>Nenhuma ocorrência registrada.</EmptyBlock>
            )}
            {data.recurringProblems.map(
              (rec: any) => (
                <div
                  key={`${rec.categoryName}-${rec.neighborhood}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--surface-300)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <CategoryIcon
                      icon={rec.categoryIcon}
                      slug={rec.categorySlug}
                      size={20}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--fs-small)' }}>
                        {rec.categoryName}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        Bairro {rec.neighborhood}
                      </div>
                    </div>
                  </div>
                  <span
                    className="cf-badge mono"
                    style={{
                      backgroundColor: 'var(--brand-soft)',
                      color: 'var(--brand)',
                    }}
                  >
                    {rec.count} ocorrências
                  </span>
                </div>
              ),
            )}
          </div>
        </Card>

        {/* Cartão Agrupamentos geográficos (mini-mapa com clusters) */}
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 className="h3">Agrupamentos geográficos</h2>
            <Link
              to="/admin/mapa"
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--brand)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Abrir mapa completo
            </Link>
          </div>

          <InteractiveMap
            center={[-23.5505, -46.645]}
            zoom={11}
            height={260}
            points={mapQuery.data?.points ?? []}
            clusters={mapQuery.data?.clusters ?? data.geographicClusters}
            onSelectPoint={(pt) => navigate(`/admin/solicitacoes/${pt.id}`)}
            ariaLabel="Mini-mapa com agrupamentos geográficos do dashboard"
          />
          <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
            Ocorrências em aberto. Clique em um total para aproximar e em um marcador para tratar o chamado.
          </p>
        </Card>
      </div>

      {/* Demandas por departamento em barras */}
      <BarList
        title="Demandas por departamento"
        items={data.demandsByDepartment}
        unitLabel="Demandas"
      />
    </AdminLayout>
  );
};
