import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  Button,
  Card,
  Field,
  Notice,
} from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { StatusBadge } from '../../components/Badges';
import { apiFetch, errorMessage } from '../../lib/api';

/** Consulta pública por protocolo (Lei nº 13.460/2017): não exige login. */
export const CitizenRequestsPage: React.FC = () => {
  const [protocolInput, setProtocolInput] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const protocol = protocolInput.trim().toUpperCase();
    if (!protocol) return;
    setError(null);
    setResult(null);
    setSearching(true);
    try {
      setResult(
        await apiFetch(`/occurrences/by-protocol/${encodeURIComponent(protocol)}`),
      );
    } catch (err) {
      setError(errorMessage(err, `Não foi possível consultar o protocolo ${protocol}.`));
    } finally {
      setSearching(false);
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
        className="public-narrow"
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h1 className="h2">Consultar solicitação</h1>

        <Card>
          <form onSubmit={handleLookup}>
            <Field
              label="Consultar por protocolo"
              hint="Acompanhe qualquer solicitação informando o número do protocolo (sem necessidade de login)"
            >
              {(props) => (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    {...props}
                    type="search"
                    className="cf-input mono"
                    style={{ flex: 1 }}
                    value={protocolInput}
                    onChange={(e) => setProtocolInput(e.target.value)}
                    placeholder="Ex.: CF-2026-004812"
                  />
                  <Button type="submit" variant="primary" disabled={searching}>
                    <Search size={18} aria-hidden="true" />
                    <span>Consultar</span>
                  </Button>
                </div>
              )}
            </Field>
          </form>

          {error && <Notice variant="danger">{error}</Notice>}

          {result && (
            <div
              style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--brand-soft)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                  {result.protocol}
                </span>
                <StatusBadge status={result.status} />
              </div>
              <div style={{ fontWeight: 600 }}>{result.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                {result.categoryName} · Bairro {result.neighborhood}
              </div>
              <Link
                to={`/solicitacoes/${result.protocol}`}
                className="cf-btn cf-btn-primary"
                style={{ marginTop: 4 }}
              >
                Abrir linha do tempo completa
              </Link>
            </div>
          )}
        </Card>

        <Notice variant="info">
          Quem tem conta acompanha todas as suas solicitações pelo aplicativo do cidadão.
        </Notice>
      </main>
    </div>
  );
};
