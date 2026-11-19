import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, ArrowRight } from 'lucide-react';
import {
  Button,
  Card,
  EmergencyBanner,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { StatusBadge } from '../../components/Badges';
import { CategoryIcon } from '../../components/CategoryIcons';
import { apiFetch } from '../../lib/api';
import { useCategories } from '../../lib/queries';

export const CitizenHomePage: React.FC = () => {
  const navigate = useNavigate();
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  const mapQuery = useQuery({
    queryKey: ['public-map', 'home'],
    queryFn: () => apiFetch('/map/occurrences?status=open&limit=3'),
  });

  const recentOccurrences: any[] = mapQuery.data?.points ?? [];

  return (
    <div className="citizen-shell">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>

      <PublicHeader />

      <main
        id="main-content"
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        {/* Aviso Obrigatório de Emergência */}
        <EmergencyBanner />

        {/* Botão Grande Registrar Problema */}
        <section aria-labelledby="cta-heading">
          <h1 id="cta-heading" className="h2" style={{ marginBottom: 'var(--space-2)' }}>
            Viu um problema na sua rua?
          </h1>
          <p
            style={{
              margin: '0 0 var(--space-3) 0',
              color: 'var(--ink-muted)',
              fontSize: 'var(--fs-small)',
            }}
          >
            Registre solicitações de zeladoria urbana e acompanhe o andamento pelo protocolo.
          </p>
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => navigate('/registrar')}
            style={{ minHeight: 54, fontSize: 'var(--fs-h3)' }}
          >
            <PlusCircle size={22} aria-hidden="true" />
            <span>Registrar problema</span>
          </Button>
        </section>

        {/* Grade das 7 Categorias com atalho Ver no mapa */}
        <section aria-labelledby="cat-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 id="cat-heading" className="h3">
              Categorias de atendimento
            </h2>
            <Link
              to="/mapa"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--brand)',
                fontWeight: 600,
                fontSize: 'var(--fs-small)',
                textDecoration: 'none',
                minHeight: 44,
              }}
            >
              <span>Ver no mapa</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {categoriesQuery.isLoading && <LoadingBlock label="Carregando categorias..." />}
          {categoriesQuery.error && (
            <ErrorBlock
              error={categoriesQuery.error}
              onRetry={() => categoriesQuery.refetch()}
            />
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {categories.map((cat: any) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/registrar?categoryId=${cat.id}`)}
                className="cf-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  minHeight: 60,
                  padding: 'var(--space-3)',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--brand-soft)',
                    color: 'var(--brand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <CategoryIcon icon={cat.icon} slug={cat.slug} size={20} />
                </div>
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Seção com as ocorrências em aberto mais recentes da cidade */}
        <section aria-labelledby="nearby-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-2)',
            }}
          >
            <h2 id="nearby-heading" className="h3">
              Registros recentes na cidade
            </h2>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Dados agregados e anônimos
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {mapQuery.isLoading && <LoadingBlock />}
            {mapQuery.error && (
              <ErrorBlock error={mapQuery.error} onRetry={() => mapQuery.refetch()} />
            )}
            {mapQuery.data && recentOccurrences.length === 0 && (
              <Card>
                <EmptyBlock>Nenhuma ocorrência em aberto no momento.</EmptyBlock>
              </Card>
            )}
            {recentOccurrences.map((occ: any) => (
              <Card
                key={occ.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>
                    {occ.categoryName} · {occ.neighborhood}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                    {occ.title}
                  </div>
                  <div className="mono" style={{ fontSize: 12, marginTop: 2 }}>
                    {occ.protocol}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <StatusBadge status={occ.status} />
                  <Link
                    to={`/solicitacoes/${occ.id}`}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--brand)',
                      textDecoration: 'none',
                    }}
                  >
                    Detalhes
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
