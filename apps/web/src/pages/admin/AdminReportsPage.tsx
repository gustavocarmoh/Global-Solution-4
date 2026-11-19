import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { AdminLayout } from './AdminLayout';
import { apiDownload, apiFetch, errorMessage } from '../../lib/api';

const REPORT_CARDS = [
  {
    id: 'monthly',
    title: 'Desempenho mensal',
    description:
      'Evolução mensal de solicitações registradas, concluídas, não procedentes e em aberto.',
    endpoint: '/admin/reports/monthly',
  },
  {
    id: 'by-department',
    title: 'Demandas por departamento',
    description:
      'Volume total encaminhado, atendimentos concluídos, tempo médio de resolução e cumprimento do prazo de execução por secretaria.',
    endpoint: '/admin/reports/by-department',
  },
  {
    id: 'recurring-by-neighborhood',
    title: 'Problemas recorrentes por bairro',
    description:
      'Agrupamentos de categorias mais frequentes em cada bairro para planejamento preventivo.',
    endpoint: '/admin/reports/recurring-by-neighborhood',
  },
];

interface ReportPreview {
  id: string;
  title: string;
  period: string;
  columns: Array<{ key: string; label: string }>;
  items: Array<Record<string, any>>;
}

export const AdminReportsPage: React.FC = () => {
  const {
    data: kpis,
    isLoading,
    error,
    refetch,
  } = useQuery<any[]>({
    queryKey: ['admin-kpis'],
    queryFn: () => apiFetch('/admin/kpis'),
  });

  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleGenerate = async (rep: (typeof REPORT_CARDS)[number]) => {
    setActionError(null);
    setBusy(rep.id);
    try {
      const data = await apiFetch(rep.endpoint);
      setPreview({ id: rep.id, ...data });
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível gerar o relatório.'));
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (
    rep: (typeof REPORT_CARDS)[number],
    format: 'pdf' | 'csv',
  ) => {
    setActionError(null);
    setBusy(`${rep.id}-${format}`);
    try {
      await apiDownload(
        `${rep.endpoint}?format=${format}`,
        `relatorio-${rep.id}.${format}`,
      );
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível exportar o relatório.'));
    } finally {
      setBusy(null);
    }
  };

  const activeReport =
    REPORT_CARDS.find((r) => r.id === preview?.id) || REPORT_CARDS[0];

  const renderKpiBadge = (status: string) => {
    if (status === 'atingida') {
      return (
        <span
          className="cf-badge"
          style={{
            backgroundColor: 'var(--status-done-bg)',
            color: 'var(--status-done-fg)',
          }}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>Meta atingida</span>
        </span>
      );
    }
    if (status === 'abaixo da meta') {
      return (
        <span
          className="cf-badge"
          style={{
            backgroundColor: 'var(--status-rejected-bg)',
            color: 'var(--status-rejected-fg)',
          }}
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span>Abaixo da meta</span>
        </span>
      );
    }
    return (
      <span
        className="cf-badge"
        style={{
          backgroundColor: 'var(--status-progress-bg)',
          color: 'var(--status-progress-fg)',
        }}
      >
        <Clock size={14} aria-hidden="true" />
        <span>Em acompanhamento</span>
      </span>
    );
  };

  return (
    <AdminLayout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div>
          <h1 className="h1">Relatórios e indicadores</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
            Dados calculados em tempo real a partir das solicitações registradas
            {preview?.period ? ` · Período: ${preview.period}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => handleDownload(activeReport, 'pdf')}
          >
            <FileText size={18} aria-hidden="true" />
            <span>Exportar PDF</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy !== null}
            onClick={() => handleDownload(activeReport, 'csv')}
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
            <span>Exportar planilha</span>
          </Button>
        </div>
      </div>

      {/* Três cartões de relatório com botão "Gerar relatório" */}
      <section
        aria-label="Relatórios gerenciais disponíveis"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {REPORT_CARDS.map((rep) => (
          <Card
            key={rep.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <h2 className="h3" style={{ marginBottom: 'var(--space-2)' }}>
                {rep.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--fs-small)',
                  color: 'var(--ink-muted)',
                }}
              >
                {rep.description}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={busy !== null}
              onClick={() => handleGenerate(rep)}
            >
              {busy === rep.id ? 'Gerando...' : 'Gerar relatório'}
            </Button>
          </Card>
        ))}
      </section>

      {actionError && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="danger">{actionError}</Notice>
        </div>
      )}

      {/* Pré-visualização do relatório gerado, com os mesmos dados da exportação */}
      {preview && (
        <section
          aria-labelledby="report-preview-heading"
          style={{ marginBottom: 'var(--space-5)' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 id="report-preview-heading" className="h2">
              {preview.title}
            </h2>
            <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
              Os botões “Exportar” acima baixam este relatório
            </span>
          </div>
          {preview.items.length === 0 ? (
            <EmptyBlock>Nenhum registro no período.</EmptyBlock>
          ) : (
            <div className="cf-table-wrapper">
              <table className="cf-table">
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c.key} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((row, idx) => (
                    <tr key={idx}>
                      {preview.columns.map((c, colIdx) => (
                        <td
                          key={c.key}
                          className={colIdx === 0 ? undefined : 'mono'}
                          style={colIdx === 0 ? { fontWeight: 700 } : undefined}
                        >
                          {row[c.key] === null || row[c.key] === undefined
                            ? '—'
                            : typeof row[c.key] === 'number'
                              ? row[c.key].toLocaleString('pt-BR')
                              : String(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tabela "Indicadores e metas iniciais" (Seção 8.14 e Regra 12) */}
      <section aria-labelledby="kpis-heading" style={{ marginBottom: 'var(--space-4)' }}>
        <h2 id="kpis-heading" className="h2" style={{ marginBottom: 'var(--space-3)' }}>
          Indicadores e metas iniciais
        </h2>

        {isLoading && <LoadingBlock label="Calculando indicadores..." />}
        {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}
        {kpis && (
        <div className="cf-table-wrapper">
          <table className="cf-table">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Objetivo</th>
                <th scope="col">Meta inicial</th>
                <th scope="col">Resultado</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((row: any) => (
                <tr key={row.id || row.indicator}>
                  <td style={{ fontWeight: 700 }}>{row.indicator}</td>
                  <td style={{ color: 'var(--ink-muted)' }}>{row.objective}</td>
                  <td>{row.target}</td>
                  <td className="mono" style={{ fontWeight: 700 }}>
                    {row.result}
                  </td>
                  <td>{renderKpiBadge(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* Aviso metodológico obrigatório (Seção 8.14) */}
      <Notice variant="warning">
        As metas são preliminares e se ajustam aos dados reais e à capacidade
        operacional do município. O tempo de triagem mede a resposta
        administrativa, não a execução física da manutenção.
      </Notice>
    </AdminLayout>
  );
};
