import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCheck, X } from 'lucide-react';
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
import { PriorityBadge, StatusBadge } from '../../components/Badges';
import { CategoryIcon } from '../../components/CategoryIcons';
import { InteractiveMap } from '../../components/InteractiveMap';
import { AdminLayout } from './AdminLayout';
import { apiFetch, errorMessage } from '../../lib/api';
import {
  NEIGHBORHOOD_CENTERS,
  useCategories,
  useDepartments,
} from '../../lib/queries';

const PAGE_SIZE = 8;

export const AdminRequestsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);

  const [showAssistedModal, setShowAssistedModal] = useState(
    searchParams.get('assisted') === '1',
  );
  const { data: categories = [] } = useCategories();
  const { data: departments = [] } = useDepartments();

  const [assistedCategory, setAssistedCategory] = useState('');
  const [assistedDesc, setAssistedDesc] = useState('');
  const [assistedAddress, setAssistedAddress] = useState('');
  const [assistedNeighborhood, setAssistedNeighborhood] = useState<string>(
    NEIGHBORHOODS[0],
  );
  const [assistedName, setAssistedName] = useState('');
  const [assistedContact, setAssistedContact] = useState('');
  const [assistedFocus, setAssistedFocus] = useState<[number, number]>(
    NEIGHBORHOOD_CENTERS[NEIGHBORHOODS[0]],
  );
  const [assistedPosition, setAssistedPosition] = useState<[number, number]>(
    NEIGHBORHOOD_CENTERS[NEIGHBORHOODS[0]],
  );
  const [assistedFeedback, setAssistedFeedback] = useState<string | null>(null);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  const [assistedSaving, setAssistedSaving] = useState(false);

  const queryStr = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (q) queryStr.set('q', q);
  if (status) queryStr.set('status', status);
  if (category) queryStr.set('category', category);
  if (departmentId) queryStr.set('departmentId', departmentId);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-occurrences', q, status, category, departmentId, page],
    queryFn: () => apiFetch(`/admin/occurrences?${queryStr.toString()}`),
    placeholderData: keepPreviousData,
  });

  const items: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const startRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, total);

  const handleAssistedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssistedFeedback(null);
    setAssistedError(null);

    const categoryId = assistedCategory || categories[0]?.id;
    if (!categoryId) {
      setAssistedError('Selecione a categoria do relato.');
      return;
    }
    if (assistedDesc.trim().length < 10) {
      setAssistedError('A descrição deve ter no mínimo 10 caracteres.');
      return;
    }

    setAssistedSaving(true);
    try {
      const res = await apiFetch('/admin/occurrences/assisted', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          description: assistedDesc,
          addressText: assistedAddress,
          neighborhood: assistedNeighborhood,
          latitude: assistedPosition[0],
          longitude: assistedPosition[1],
          requesterName: assistedName || undefined,
          requesterContact: assistedContact || undefined,
        }),
      });
      setAssistedFeedback(
        `Registro assistido concluído. Protocolo para entregar ao cidadão: ${res.protocol}` +
          (res.groupedWithSimilar
            ? ' (associado a relatos semelhantes na mesma área).'
            : ''),
      );
      setAssistedDesc('');
      setAssistedAddress('');
      setAssistedName('');
      setAssistedContact('');
      queryClient.invalidateQueries({ queryKey: ['admin-occurrences'] });
    } catch (err) {
      setAssistedError(
        errorMessage(err, 'Não foi possível registrar a solicitação.'),
      );
    } finally {
      setAssistedSaving(false);
    }
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
          <h1 className="h1">Solicitações</h1>
          <p
            style={{
              margin: '4px 0 0 0',
              color: 'var(--ink-muted)',
              fontSize: 'var(--fs-body)',
            }}
          >
            {data
              ? `${data.pendingCount} pendentes · ${data.inProgressCount} em andamento neste filtro · `
              : ''}
            ordenadas por prioridade e data
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowAssistedModal((v) => !v)}
        >
          <UserCheck size={18} aria-hidden="true" />
          <span>Registro assistido (balcão/telefone)</span>
        </Button>
      </div>

      {/* Formulário de Registro Assistido (Regra 10) */}
      {showAssistedModal && (
        <Card
          style={{
            marginBottom: 'var(--space-5)',
            border: '2px solid var(--brand)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 className="h3">
              Registro assistido (em nome de cidadão atendido no balcão ou telefone)
            </h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowAssistedModal(false);
                setSearchParams({});
              }}
              style={{ minHeight: 44, padding: '0 var(--space-3)' }}
            >
              <X size={18} aria-hidden="true" />
              <span>Fechar</span>
            </Button>
          </div>

          {assistedFeedback && (
            <div style={{ marginBottom: 'var(--space-3)' }} role="status">
              <Notice variant="info">{assistedFeedback}</Notice>
            </div>
          )}
          {assistedError && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <Notice variant="danger">{assistedError}</Notice>
            </div>
          )}

          <form
            onSubmit={handleAssistedSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <Field label="Categoria" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={assistedCategory || categories[0]?.id || ''}
                  onChange={(e) => setAssistedCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Bairro" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={assistedNeighborhood}
                  onChange={(e) => {
                    setAssistedNeighborhood(e.target.value);
                    const center = NEIGHBORHOOD_CENTERS[e.target.value];
                    if (center) {
                      setAssistedPosition(center);
                      setAssistedFocus(center);
                    }
                  }}
                >
                  {NEIGHBORHOODS.map((nb) => (
                    <option key={nb} value={nb}>
                      {nb}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Endereço informado" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={assistedAddress}
                  onChange={(e) => setAssistedAddress(e.target.value)}
                  placeholder="Rua e número aproximado"
                  required
                />
              )}
            </Field>

            <Field label="Nome do cidadão (opcional)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={assistedName}
                  onChange={(e) => setAssistedName(e.target.value)}
                />
              )}
            </Field>

            <Field label="Contato do cidadão (opcional)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={assistedContact}
                  onChange={(e) => setAssistedContact(e.target.value)}
                  placeholder="E-mail ou telefone"
                />
              )}
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Descrição do relato (mínimo 10 caracteres)" required>
                {(props) => (
                  <textarea
                    {...props}
                    className="cf-textarea"
                    style={{ minHeight: 80 }}
                    value={assistedDesc}
                    onChange={(e) => setAssistedDesc(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="cf-label" style={{ marginBottom: 6 }}>
                Local no mapa (clique para posicionar o ponto informado pelo cidadão)
              </div>
              <InteractiveMap
                center={assistedFocus}
                zoom={15}
                height={220}
                pickerPosition={assistedPosition}
                onPickLocation={(lat, lng) => setAssistedPosition([lat, lng])}
                ariaLabel="Mapa para posicionar o local do registro assistido"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <Button type="submit" variant="primary" disabled={assistedSaving}>
                {assistedSaving
                  ? 'Registrando...'
                  : 'Registrar e emitir protocolo para o cidadão'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Barra de Filtros: Busca, Estado, Categoria, Departamento */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <Field label="Busca">
            {(props) => (
              <input
                {...props}
                type="search"
                className="cf-input"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Protocolo, endereço ou bairro..."
              />
            )}
          </Field>

          <Field label="Estado">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os estados</option>
                {Object.entries(OCCURRENCE_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
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
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
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

          <Field label="Departamento">
            {(props) => (
              <select
                {...props}
                className="cf-select"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setPage(1);
                }}
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

      {isLoading && <LoadingBlock label="Carregando solicitações..." />}
      {!isLoading && error && <ErrorBlock error={error} onRetry={() => refetch()} />}
      {data && items.length === 0 && (
        <Card>
          <EmptyBlock>Nenhuma solicitação encontrada com os filtros selecionados.</EmptyBlock>
        </Card>
      )}

      {/* Tabela de Solicitações (Cabeçalho fixo, linhas de 56px) */}
      {items.length > 0 && (
      <div className="cf-table-wrapper">
        <table className="cf-table">
          <thead>
            <tr>
              <th scope="col">Protocolo</th>
              <th scope="col">Categoria e local</th>
              <th scope="col">Departamento</th>
              <th scope="col">Prioridade</th>
              <th scope="col">Estado</th>
              <th scope="col">Registrada</th>
              <th scope="col">Ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((occ: any) => {
              const dateStr = new Date(occ.createdAt).toLocaleDateString('pt-BR');
              return (
                <tr key={occ.id}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {occ.protocol}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <CategoryIcon
                        icon={occ.categoryIcon}
                        slug={occ.categorySlug}
                        size={18}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {occ.categoryName}{' '}
                          {occ.similarCount > 0 && (
                            <span
                              className="cf-badge"
                              style={{
                                backgroundColor: 'var(--brand-soft)',
                                color: 'var(--brand)',
                                marginLeft: 6,
                                fontSize: 12,
                              }}
                            >
                              +{occ.similarCount} semelhantes
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          {occ.addressText} ({occ.neighborhood})
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{occ.departmentName}</td>
                  <td>
                    <PriorityBadge priority={occ.priority} />
                  </td>
                  <td>
                    <StatusBadge status={occ.status as OccurrenceStatus} />
                  </td>
                  <td className="mono">{dateStr}</td>
                  <td>
                    <Link
                      to={`/admin/solicitacoes/${occ.id}`}
                      style={{
                        color: 'var(--brand)',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Rodapé de paginação com Anterior e Próxima */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-4)',
        }}
      >
        <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
          {total === 0
            ? 'Nenhuma solicitação'
            : `${startRow} a ${endRow} de ${total.toLocaleString('pt-BR')} solicitações`}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ minHeight: 44 }}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={endRow >= total}
            onClick={() => setPage((p) => p + 1)}
            style={{ minHeight: 44 }}
          >
            Próxima
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};
