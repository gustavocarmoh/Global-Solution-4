import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ShieldCheck } from 'lucide-react';
import { Button, Card, ErrorBlock, LoadingBlock, Notice } from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { StatusBadge } from '../../components/Badges';
import { apiDownload, apiFetch, errorMessage } from '../../lib/api';

/** Dados abertos: a base anonimizada de solicitações para qualquer pessoa baixar e analisar. */
export const PublicOpenDataPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: ['open-data'],
    queryFn: () => apiFetch('/public/open-data'),
    staleTime: 5 * 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = async (format: 'csv' | 'json') => {
    setDownloadError(null);
    setBusy(format);
    try {
      await apiDownload(`/public/open-data?format=${format}`, `cidade-em-foco-dados-abertos.${format}`);
    } catch (err) {
      setDownloadError(errorMessage(err, 'Não foi possível baixar o arquivo.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="citizen-shell">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <PublicHeader />
      <main
        id="main-content"
        style={{
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1 className="h1">Dados abertos</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
            Baixe a base de solicitações para fazer a sua própria análise, em planilha ou JSON.
          </p>
        </div>

        <Card>
          <h2 className="h3" style={{ marginBottom: 'var(--space-2)' }}>
            O que está nos arquivos
          </h2>
          <p style={{ marginTop: 0 }}>
            Uma linha por solicitação: <strong>protocolo, categoria, departamento, bairro, estado,
            prioridade, data de registro e data de encerramento</strong>.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--surface-300)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--fs-small)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <ShieldCheck size={18} aria-hidden="true" color="var(--brand)" />
            <span>
              Dados anonimizados: não há descrição do relato, endereço, coordenadas, nome nem contato de
              ninguém (LGPD).
            </span>
          </div>

          {downloadError && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <Notice variant="danger">{downloadError}</Notice>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <Button type="button" variant="primary" disabled={busy !== null} onClick={() => download('csv')}>
              <Download size={18} aria-hidden="true" />
              <span>{busy === 'csv' ? 'Baixando...' : 'Baixar planilha (CSV)'}</span>
            </Button>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => download('json')}>
              <Download size={18} aria-hidden="true" />
              <span>{busy === 'json' ? 'Baixando...' : 'Baixar JSON'}</span>
            </Button>
          </div>
        </Card>

        {isLoading && <LoadingBlock label="Carregando prévia..." />}
        {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}

        {data && (
          <section aria-labelledby="preview-heading">
            <h2 id="preview-heading" className="h2" style={{ marginBottom: 'var(--space-3)' }}>
              Prévia — {data.total.toLocaleString('pt-BR')} solicitações na base
            </h2>
            <div className="cf-table-wrapper">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th scope="col">Protocolo</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Bairro</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Registrada em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.slice(0, 10).map((row: any) => (
                    <tr key={row.protocol}>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {row.protocol}
                      </td>
                      <td>{row.category}</td>
                      <td>{row.neighborhood}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="mono">{row.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
