import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarList } from '../../components/DataVisuals';
import {
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Pager,
  Stars,
} from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../lib/api';

const PAGE_SIZE = 10;

/** O que os cidadãos acharam do atendimento: média, distribuição e comentários. */
export const AdminRatingsPage: React.FC = () => {
  const [stars, setStars] = useState(0);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['admin-ratings', stars, page],
    queryFn: () =>
      apiFetch(`/admin/ratings?page=${page}&pageSize=${PAGE_SIZE}${stars ? `&stars=${stars}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const summary = data?.summary;

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Avaliações do atendimento</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Notas e comentários enviados pelos cidadãos ao receber o serviço concluído
        </p>
      </div>

      {isLoading && <LoadingBlock label="Carregando avaliações..." />}
      {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}

      {summary && (
        <>
          <section
            aria-label="Resumo das avaliações"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <Card>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Nota média</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                {summary.average === null ? '—' : `${String(summary.average).replace('.', ',')} de 5`}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Avaliações recebidas</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                {summary.total.toLocaleString('pt-BR')}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Positivas (4 e 5 estrelas)</div>
              <div
                className="mono"
                style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--brand)' }}
              >
                {summary.positivePct === null ? '—' : `${summary.positivePct}%`}
              </div>
            </Card>
          </section>

          <div style={{ marginBottom: 'var(--space-5)' }}>
            <BarList
              title="Distribuição das notas"
              unitLabel="Avaliações"
              items={summary.distribution.map((d: any) => ({
                label: `${d.stars} ${d.stars === 1 ? 'estrela' : 'estrelas'}`,
                value: d.count,
              }))}
            />
          </div>
        </>
      )}

      <div
        role="group"
        aria-label="Filtrar por nota"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}
      >
        {[0, 5, 4, 3, 2, 1].map((n) => (
          <Chip
            key={n}
            active={stars === n}
            onClick={() => {
              setStars(n);
              setPage(1);
            }}
          >
            {n === 0 ? 'Todas as notas' : `${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
          </Chip>
        ))}
      </div>

      {data && data.items.length === 0 && (
        <Card>
          <EmptyBlock>Nenhuma avaliação com este filtro.</EmptyBlock>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {data?.items.map((r: any) => (
          <Card key={r.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <Stars value={r.stars} readOnly />
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {new Date(r.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <p style={{ margin: '0 0 var(--space-2) 0' }}>
              {r.comment ? `“${r.comment}”` : <em style={{ color: 'var(--ink-muted)' }}>Sem comentário</em>}
            </p>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              <Link
                to={`/admin/solicitacoes/${r.occurrenceId}`}
                className="mono"
                style={{ color: 'var(--brand)', fontWeight: 700, textDecoration: 'none' }}
              >
                {r.protocol}
              </Link>{' '}
              · {r.categoryName} · {r.neighborhood} · {r.departmentName}
            </div>
          </Card>
        ))}
      </div>

      {data && (
        <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} noun="avaliações" />
      )}
    </AdminLayout>
  );
};
