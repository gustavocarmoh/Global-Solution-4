import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LocateFixed, List, Map as MapIcon, ShieldCheck } from 'lucide-react';
import {
  NEIGHBORHOODS,
  OccurrenceStatus,
  OCCURRENCE_STATUS_LABELS,
} from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { StatusBadge } from '../../components/Badges';
import { InteractiveMap, MapPointItem } from '../../components/InteractiveMap';
import { apiFetch } from '../../lib/api';
import { CITY_CENTER, NEIGHBORHOOD_CENTERS, useCategories } from '../../lib/queries';

export const CitizenMapPage: React.FC = () => {
  const [neighborhood, setNeighborhood] = useState<string>('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [mapCenter, setMapCenter] = useState<[number, number]>(CITY_CENTER);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPointItem | null>(null);

  const { data: categories = [] } = useCategories();

  const queryParams = new URLSearchParams();
  if (neighborhood) queryParams.set('neighborhood', neighborhood);
  if (categorySlug) queryParams.set('category', categorySlug);
  if (statusFilter) queryParams.set('status', statusFilter);

  const { data: mapData, isLoading, error, refetch } = useQuery({
    queryKey: ['public-map', neighborhood, categorySlug, statusFilter],
    queryFn: () => apiFetch(`/map/occurrences?${queryParams.toString()}`),
    placeholderData: keepPreviousData,
  });

  const points: MapPointItem[] = mapData?.points ?? [];
  const clusters = mapData?.clusters ?? [];
  const totalInFilter: number = clusters.reduce(
    (acc: number, c: any) => acc + c.count,
    0,
  );

  const selectNeighborhood = (nb: string) => {
    setNeighborhood(nb);
    setSelectedPoint(null);
    setMapCenter(nb ? NEIGHBORHOOD_CENTERS[nb] || CITY_CENTER : CITY_CENTER);
  };

  const handleUseMyLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Este navegador não oferece localização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapCenter([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setGeoError(
          'Não foi possível obter sua localização. Verifique a permissão do navegador.',
        );
      },
    );
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
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <h1 className="h2">Mapa da cidade</h1>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setViewMode((v) => (v === 'map' ? 'list' : 'map'))}
            style={{ minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--fs-small)' }}
          >
            {viewMode === 'map' ? (
              <>
                <List size={18} aria-hidden="true" />
                <span>Ver como lista</span>
              </>
            ) : (
              <>
                <MapIcon size={18} aria-hidden="true" />
                <span>Ver no mapa</span>
              </>
            )}
          </Button>
        </div>

        {/* Filtros em Chips: Bairro, Categoria, Estado */}
        <section aria-label="Filtros do mapa" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
            <Chip active={neighborhood === ''} onClick={() => selectNeighborhood('')}>
              Todos os bairros
            </Chip>
            {NEIGHBORHOODS.map((nb) => (
              <Chip
                key={nb}
                active={neighborhood === nb}
                onClick={() => selectNeighborhood(neighborhood === nb ? '' : nb)}
              >
                {nb}
              </Chip>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
            <Chip active={categorySlug === ''} onClick={() => setCategorySlug('')}>
              Todas as categorias
            </Chip>
            {categories.map((cat: any) => (
              <Chip
                key={cat.slug}
                active={categorySlug === cat.slug}
                onClick={() =>
                  setCategorySlug(categorySlug === cat.slug ? '' : cat.slug)
                }
              >
                {cat.name}
              </Chip>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
            <Chip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
              Todos os estados
            </Chip>
            <Chip
              active={statusFilter === 'open'}
              onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')}
            >
              Em aberto
            </Chip>
            <Chip
              active={statusFilter === OccurrenceStatus.DONE}
              onClick={() =>
                setStatusFilter(
                  statusFilter === OccurrenceStatus.DONE ? '' : OccurrenceStatus.DONE,
                )
              }
            >
              {OCCURRENCE_STATUS_LABELS[OccurrenceStatus.DONE]}
            </Chip>
          </div>
        </section>

        {/* Nota fixa de privacidade LGPD */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--surface-300)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--ink-muted)',
          }}
        >
          <ShieldCheck size={16} aria-hidden="true" color="var(--brand)" />
          <span>Os dados de quem registrou nunca aparecem no mapa.</span>
        </div>

        {isLoading && <LoadingBlock label="Carregando ocorrências..." />}
        {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}
        {geoError && <Notice variant="warning">{geoError}</Notice>}
        {mapData && (
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }} role="status">
            {totalInFilter === 0
              ? 'Nenhuma ocorrência neste filtro.'
              : `Exibindo as ${points.length} mais recentes de ${totalInFilter.toLocaleString('pt-BR')} ocorrências neste filtro. O número em cada círculo é o total do bairro.`}
          </div>
        )}

        {viewMode === 'map' ? (
          <>
            <InteractiveMap
              center={mapCenter}
              zoom={neighborhood ? 14 : 11}
              height={520}
              points={points}
              clusters={clusters}
              selectedPointId={selectedPoint?.id || null}
              onSelectPoint={(pt) => setSelectedPoint(pt)}
            />

            {/* Legenda e botão Minha localização */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-3)', fontSize: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: 'var(--brand)',
                      display: 'inline-block',
                    }}
                  />
                  Ocorrência
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: 'var(--sun)',
                      border: '1px solid var(--ink)',
                      display: 'inline-block',
                    }}
                  />
                  Selecionada
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    (N)
                  </span>
                  Agrupamento
                </span>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={handleUseMyLocation}
                style={{ minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--fs-small)' }}
              >
                <LocateFixed size={16} aria-hidden="true" />
                <span>Minha localização</span>
              </Button>
            </div>

            {/* Cartão inferior ao selecionar pin */}
            {selectedPoint && (
              <Card aria-live="polite" style={{ border: '2px solid var(--brand)' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-small)' }}>
                    {selectedPoint.categoryName} · {selectedPoint.neighborhood}
                  </span>
                  <StatusBadge status={selectedPoint.status as OccurrenceStatus} />
                </div>
                <div style={{ fontSize: 'var(--fs-small)', marginBottom: 'var(--space-2)' }}>
                  {selectedPoint.title}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    {selectedPoint.protocol}
                  </span>
                  <Link
                    to={`/solicitacoes/${selectedPoint.id}`}
                    className="cf-btn cf-btn-primary"
                    style={{ minHeight: 44, padding: '0 var(--space-4)', fontSize: 'var(--fs-small)' }}
                  >
                    Ver detalhes
                  </Link>
                </div>
              </Card>
            )}
          </>
        ) : (
          /* Alternativa acessível: Ver como lista */
          <div
            role="region"
            aria-label="Lista de ocorrências do mapa"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            {mapData && points.length === 0 && (
              <Card>
                <EmptyBlock>Nenhuma ocorrência neste filtro.</EmptyBlock>
              </Card>
            )}
            {points.map((pt) => (
              <Card key={pt.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {pt.protocol}
                  </span>
                  <StatusBadge status={pt.status as OccurrenceStatus} />
                </div>
                <div style={{ fontWeight: 600 }}>{pt.title}</div>
                <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)', marginBottom: 8 }}>
                  {pt.categoryName} · Bairro {pt.neighborhood}
                </div>
                <Link
                  to={`/solicitacoes/${pt.id}`}
                  className="cf-btn cf-btn-secondary"
                  style={{ minHeight: 44, width: '100%' }}
                >
                  Ver detalhes
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
