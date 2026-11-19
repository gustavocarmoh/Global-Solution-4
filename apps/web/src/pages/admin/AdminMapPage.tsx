import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  NEIGHBORHOODS,
  OccurrenceStatus,
  OCCURRENCE_STATUS_LABELS,
} from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  EmptyBlock,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { StatusBadge } from '../../components/Badges';
import { InteractiveMap, MapFocus, MapPointItem } from '../../components/InteractiveMap';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../lib/api';
import {
  CITY_CENTER,
  NEIGHBORHOOD_CENTERS,
  useCategories,
  useDepartments,
} from '../../lib/queries';

export const AdminMapPage: React.FC = () => {
  const navigate = useNavigate();

  const [neighborhood, setNeighborhood] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('open');
  const [departmentId, setDepartmentId] = useState('');

  const queryParams = new URLSearchParams();
  if (neighborhood) queryParams.set('neighborhood', neighborhood);
  if (category) queryParams.set('category', category);
  if (status) queryParams.set('status', status);
  if (departmentId) queryParams.set('departmentId', departmentId);

  const { data: categories = [] } = useCategories();
  const { data: departments = [] } = useDepartments();

  const { data: mapData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-map', neighborhood, category, status, departmentId],
    queryFn: () => apiFetch(`/admin/map?${queryParams.toString()}`),
    placeholderData: keepPreviousData,
  });

  const points: MapPointItem[] = mapData?.points ?? [];
  const clusters = mapData?.clusters ?? [];
  const totalInFilter: number = clusters.reduce(
    (acc: number, c: any) => acc + c.count,
    0,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint =
    points.find((pt) => pt.id === selectedId) ?? points[0] ?? null;

  // Quando o item vem da lista (e não do clique no marcador), o mapa vai até ele
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const selectFromList = (pt: MapPointItem) => {
    setSelectedId(pt.id);
    setFocus({ position: [pt.latitude, pt.longitude] });
  };

  const mapCenter: [number, number] = neighborhood
    ? NEIGHBORHOOD_CENTERS[neighborhood] || CITY_CENTER
    : CITY_CENTER;

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h1 className="h1">Mapa administrativo</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)' }}>
          Monitoramento geoespacial de agrupamentos e ocorrências por bairro e departamento
        </p>
      </div>

      {/* Filtros: Bairro, Categoria, Estado (padrão "Em aberto"), Departamento */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <Field label="Bairro">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
              >
                <option value="">Todos os bairros</option>
                {NEIGHBORHOODS.map((nb) => (
                  <option key={nb} value={nb}>
                    {nb}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Categoria">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Estado">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">Em aberto</option>
                <option value="all">Todos os estados</option>
                {Object.entries(OCCURRENCE_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Departamento">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Todos os departamentos</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>

      {isLoading && <LoadingBlock label="Carregando mapa..." />}
      {!isLoading && error && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorBlock error={error} onRetry={() => refetch()} />
        </div>
      )}

      {/* Grade: Mapa Grande (esquerda) + Painel Lateral (direita) */}
      <div
        className="r-grid"
        style={{ '--cols': 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 'var(--space-4)' } as React.CSSProperties}
      >
        <div>
          <InteractiveMap
            center={mapCenter}
            zoom={neighborhood ? 14 : 12}
            height="min(520px, calc(70vh / var(--ui-zoom)))"
            fitToPoints
            // Visão geral (sem bairro): zoom baixo mantém as bolhas de total; com bairro, mostra todos os chamados
            fitMaxZoom={neighborhood ? 16 : 11}
            focus={focus}
            points={points}
            clusters={clusters}
            selectedPointId={selectedPoint?.id || null}
            onSelectPoint={(pt) => setSelectedId(pt.id)}
            ariaLabel="Mapa administrativo com agrupamentos de ocorrências"
          />

          {/* Legenda: Ocorrência, Selecionada, N = total no agrupamento */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2) var(--space-5)',
              marginTop: 'var(--space-3)',
              fontSize: 'var(--fs-small)',
              color: 'var(--ink-muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'var(--brand)',
                  display: 'inline-block',
                }}
              />
              Ocorrência
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'var(--sun)',
                  border: '2px solid var(--ink)',
                  display: 'inline-block',
                }}
              />
              Selecionada
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                N
              </span>
              = total do bairro (clique para aproximar)
            </span>
          </div>
          <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
            Marcadores no mesmo endereço ficam sobrepostos: use a lista ao lado para alcançar todas as ocorrências.
          </p>
        </div>

        {/* Painel Lateral: Ocorrência selecionada + lista completa das ocorrências do filtro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {mapData && !selectedPoint && (
            <Card>
              <EmptyBlock>Nenhuma ocorrência neste filtro.</EmptyBlock>
            </Card>
          )}
          {selectedPoint && (
            <Card style={{ border: '2px solid var(--brand)' }}>
              <h2 className="h3" style={{ marginBottom: 'var(--space-2)' }}>
                Ocorrência selecionada
              </h2>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                  {selectedPoint.protocol}
                </span>
                <StatusBadge status={selectedPoint.status as OccurrenceStatus} />
              </div>

              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {selectedPoint.title}
              </div>
              <div
                style={{
                  fontSize: 'var(--fs-small)',
                  color: 'var(--ink-muted)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                {selectedPoint.categoryName} · Bairro {selectedPoint.neighborhood}
                {(selectedPoint.similarCount ?? 0) > 0 && (
                  <span
                    className="cf-badge"
                    style={{
                      backgroundColor: 'var(--brand-soft)',
                      color: 'var(--brand)',
                      marginLeft: 8,
                    }}
                  >
                    +{selectedPoint.similarCount} semelhantes
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={() => navigate(`/admin/solicitacoes/${selectedPoint.id}`)}
              >
                Tratar ocorrência
              </Button>
            </Card>
          )}

          {mapData && points.length > 0 && (
            <Card>
              <h2 className="h3" style={{ marginBottom: 'var(--space-1)' }}>
                Ocorrências neste filtro ({points.length.toLocaleString('pt-BR')})
              </h2>
              {totalInFilter > points.length && (
                <div style={{ margin: 'var(--space-2) 0' }}>
                  <Notice variant="info">
                    O mapa mostra as {points.length} mais recentes de{' '}
                    {totalInFilter.toLocaleString('pt-BR')}. Para ver as demais, refine os filtros ou use a{' '}
                    <Link to="/admin/solicitacoes">lista de solicitações</Link>.
                  </Notice>
                </div>
              )}
              <ul
                aria-label="Ocorrências neste filtro"
                style={{
                  listStyle: 'none',
                  margin: 'var(--space-2) 0 0 0',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  maxHeight: 'min(560px, calc(70vh / var(--ui-zoom)))',
                  overflowY: 'auto',
                }}
              >
                {points.map((pt) => {
                  const isSelected = pt.id === selectedPoint?.id;
                  return (
                    <li
                      key={pt.id}
                      style={{
                        border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'var(--brand)' : 'var(--line)'}`,
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isSelected ? 'var(--brand-soft)' : 'var(--surface-200)',
                        display: 'flex',
                        alignItems: 'stretch',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectFromList(pt)}
                        aria-pressed={isSelected}
                        aria-label={`Mostrar ${pt.protocol} no mapa`}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          padding: 'var(--space-3)',
                          background: 'transparent',
                          border: 'none',
                          font: 'inherit',
                          color: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 4,
                            marginBottom: 4,
                          }}
                        >
                          <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>
                            {pt.protocol}
                          </span>
                          <StatusBadge status={pt.status as OccurrenceStatus} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>{pt.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          {pt.categoryName} · {pt.neighborhood}
                        </div>
                      </button>
                      <Link
                        to={`/admin/solicitacoes/${pt.id}`}
                        aria-label={`Tratar ${pt.protocol}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 var(--space-3)',
                          borderLeft: '1px solid var(--line)',
                          color: 'var(--brand)',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        Tratar
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
