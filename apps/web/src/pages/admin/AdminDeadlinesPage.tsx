import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PriorityBadge, StatusBadge } from '../../components/Badges';
import { CategoryIcon } from '../../components/CategoryIcons';
import {
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Pager,
} from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../lib/api';

const PAGE_SIZE = 10;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

function deadlineText(item: any): { text: string; late: boolean } {
  if (item.responseOverdue && item.executionOverdue) {
    return { text: `Resposta atrasada · execução com ${item.daysLate} dia(s) de atraso`, late: true };
  }
  if (item.responseOverdue) {
    return { text: `Resposta atrasada (prazo ${fmtDate(item.responseDueAt)})`, late: true };
  }
  if (item.executionOverdue) {
    return { text: `Execução com ${item.daysLate} dia(s) de atraso (prazo ${fmtDate(item.executionDueAt)})`, late: true };
  }
  return { text: `Vence em ${fmtDate(item.executionDueAt)}`, late: false };
}

/** Acompanhamento de prazos: o que está atrasado e o que vence nos próximos dias. */
export const AdminDeadlinesPage: React.FC = () => {
  const [scope, setScope] = useState<'overdue' | 'soon'>('overdue');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['admin-deadlines', scope, page],
    queryFn: () => apiFetch(`/admin/deadlines?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const s = data?.summary;

  const cards: Array<[string, number | undefined, string]> = [
    ['Em aberto', s?.open, 'Solicitações ainda sem conclusão'],
    ['Resposta atrasada', s?.responseOverdue, 'Recebidas sem triagem dentro do prazo'],
    ['Execução atrasada', s?.executionOverdue, 'Prazo de execução já vencido'],
    ['Vencem em até 3 dias', s?.dueSoon, 'Ainda dentro do prazo'],
  ];

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Prazos e atrasos</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Os prazos vêm do cadastro de departamentos e categorias; só entram solicitações em aberto
        </p>
      </div>

      <section
        aria-label="Resumo dos prazos"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {cards.map(([label, value, hint]) => (
          <Card key={label}>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{label}</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
              {typeof value === 'number' ? value.toLocaleString('pt-BR') : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{hint}</div>
          </Card>
        ))}
      </section>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <Chip
          active={scope === 'overdue'}
          onClick={() => {
            setScope('overdue');
            setPage(1);
          }}
        >
          Atrasadas
        </Chip>
        <Chip
          active={scope === 'soon'}
          onClick={() => {
            setScope('soon');
            setPage(1);
          }}
        >
          Vencem em breve
        </Chip>
      </div>

      {isLoading && <LoadingBlock label="Carregando prazos..." />}
      {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyBlock>
            {scope === 'overdue'
              ? 'Nenhuma solicitação com prazo vencido.'
              : 'Nenhuma solicitação vence nos próximos 3 dias.'}
          </EmptyBlock>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <div className="cf-table-wrapper">
          <table className="cf-table">
            <thead>
              <tr>
                <th scope="col">Protocolo</th>
                <th scope="col">Categoria e local</th>
                <th scope="col">Departamento</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Estado</th>
                <th scope="col">Prazo</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any) => {
                const d = deadlineText(item);
                return (
                  <tr key={item.id}>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                      {item.protocol}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <CategoryIcon slug={item.categoryName} size={18} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.categoryName}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{item.neighborhood}</div>
                        </div>
                      </div>
                    </td>
                    <td>{item.departmentName}</td>
                    <td>
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td
                      style={{
                        fontWeight: d.late ? 700 : 500,
                        color: d.late ? 'var(--status-rejected-fg)' : 'var(--ink)',
                      }}
                    >
                      {d.text}
                    </td>
                    <td>
                      <Link
                        to={`/admin/solicitacoes/${item.id}`}
                        style={{ color: 'var(--brand)', fontWeight: 700, textDecoration: 'none' }}
                      >
                        Tratar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} noun="solicitações" />
      )}
    </AdminLayout>
  );
};
