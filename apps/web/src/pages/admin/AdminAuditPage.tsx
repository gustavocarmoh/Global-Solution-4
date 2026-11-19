import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, Pager } from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../lib/api';

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  ADMIN_LOGIN: 'Login institucional',
  OCCURRENCE_UPDATED: 'Solicitação tratada',
  ASSISTED_OCCURRENCE_CREATED: 'Registro assistido',
  OCCURRENCE_GROUPED_MANUALLY: 'Duplicidade associada',
  OCCURRENCE_UNGROUPED: 'Duplicidade desassociada',
  DEPARTMENT_CREATED: 'Departamento criado',
  DEPARTMENT_UPDATED: 'Departamento editado',
  CATEGORY_CREATED: 'Categoria criada',
  CATEGORY_UPDATED: 'Categoria editada',
  STAFF_USER_CREATED: 'Usuário de atendimento criado',
  STAFF_USER_UPDATED: 'Usuário de atendimento editado',
  PASSWORD_RESET: 'Senha redefinida por e-mail',
  PASSWORD_CHANGED: 'Senha alterada',
  LGPD_ACCOUNT_DELETED_AND_ANONYMIZED: 'Conta excluída (LGPD)',
  SEED_INITIALIZED: 'Carga inicial de dados',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gestor',
  triage: 'Triagem',
  department: 'Departamento',
  citizen: 'Cidadão',
};

/** Trilha de auditoria das ações administrativas, com o antes e o depois de cada alteração. */
export const AdminAuditPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['admin-audit', page],
    queryFn: () => apiFetch(`/admin/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="h1">Auditoria</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Quem fez o quê e quando. Senhas nunca são registradas.
        </p>
      </div>

      {isLoading && <LoadingBlock label="Carregando registros..." />}
      {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyBlock>Nenhum registro de auditoria.</EmptyBlock>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <div className="cf-table-wrapper">
          <table className="cf-table">
            <thead>
              <tr>
                <th scope="col">Data e hora</th>
                <th scope="col">Responsável</th>
                <th scope="col">Ação</th>
                <th scope="col">Alvo</th>
                <th scope="col">IP</th>
                <th scope="col">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row: any) => (
                <tr key={row.id}>
                  <td className="mono">{new Date(row.createdAt).toLocaleString('pt-BR')}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.actorName || 'Sistema'}</div>
                    {row.actorRole && (
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {ROLE_LABELS[row.actorRole] || row.actorRole}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{ACTION_LABELS[row.action] || row.action}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {row.entity} · {String(row.entityId).slice(0, 8)}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {row.ip || '—'}
                  </td>
                  <td>
                    {row.before || row.after ? (
                      <details>
                        <summary style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 600 }}>
                          Ver alteração
                        </summary>
                        {row.before && (
                          <>
                            <div style={{ fontSize: 12, marginTop: 6 }}>Antes</div>
                            <pre className="mono" style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(row.before, null, 2)}
                            </pre>
                          </>
                        )}
                        {row.after && (
                          <>
                            <div style={{ fontSize: 12, marginTop: 6 }}>Depois</div>
                            <pre className="mono" style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(row.after, null, 2)}
                            </pre>
                          </>
                        )}
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} noun="registros" />}
    </AdminLayout>
  );
};
