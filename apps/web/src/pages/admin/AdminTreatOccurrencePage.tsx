import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Unlink } from 'lucide-react';
import {
  OccurrencePriority,
  OCCURRENCE_PRIORITY_LABELS,
  OccurrenceStatus,
  OCCURRENCE_STATUS_LABELS,
  UserRole,
} from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
} from '../../components/DesignSystem';
import { PriorityBadge, StatusBadge } from '../../components/Badges';
import { Timeline } from '../../components/DataVisuals';
import { InteractiveMap } from '../../components/InteractiveMap';
import { AdminLayout } from './AdminLayout';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';
import { useDepartments, useSessionUser } from '../../lib/queries';

export const AdminTreatOccurrencePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: occ,
    isLoading,
    error,
    refetch,
  } = useQuery<any>({
    queryKey: ['admin-occurrence-detail', id],
    queryFn: () => apiFetch(`/admin/occurrences/${id}`),
  });
  const { data: departments = [] } = useDepartments();
  const user = useSessionUser();

  const [status, setStatus] = useState<OccurrenceStatus>(OccurrenceStatus.RECEIVED);
  const [priority, setPriority] = useState<OccurrencePriority>(
    OccurrencePriority.MEDIUM,
  );
  const [departmentId, setDepartmentId] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [targetProtocol, setTargetProtocol] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sincroniza o formulário sempre que o servidor devolve um novo estado da ocorrência
  useEffect(() => {
    if (!occ) return;
    setStatus(occ.status);
    setPriority(occ.priority);
    setDepartmentId(occ.departmentId);
  }, [occ?.id, occ?.status, occ?.priority, occ?.departmentId]);

  const isRejectedSelected = status === OccurrenceStatus.REJECTED;
  const isRejectedInvalid =
    isRejectedSelected && justification.trim().length < 5;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);

    if (isRejectedInvalid) {
      setErrorMsg(
        'Para Não procedente, a justificativa é obrigatória e fica visível ao cidadão.',
      );
      return;
    }

    setSaving(true);
    try {
      const statusChanged = status !== occ.status;
      const hasMessage = justification.trim().length > 0;
      const updated = await apiFetch(`/admin/occurrences/${occ.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          priority,
          departmentId,
          justification: justification.trim() || undefined,
        }),
      });
      setFeedback(
        statusChanged || hasMessage
          ? 'Solicitação atualizada. Histórico e auditoria registrados e cidadãos associados notificados.'
          : 'Solicitação atualizada e registrada em auditoria (sem mudança visível ao cidadão, ninguém foi notificado).',
      );
      setJustification('');
      queryClient.setQueryData(['admin-occurrence-detail', id], updated);
      queryClient.invalidateQueries({ queryKey: ['admin-occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Erro ao salvar tratamento da ocorrência.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGroupAction = async (action: 'link' | 'unlink') => {
    setErrorMsg(null);
    setFeedback(null);
    if (action === 'link' && !targetProtocol.trim()) {
      setErrorMsg('Informe o protocolo que deseja associar.');
      return;
    }
    try {
      const updated = await apiFetch(`/admin/occurrences/${occ.id}/group`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          targetProtocol: targetProtocol.trim() || undefined,
        }),
      });
      setFeedback(
        action === 'link'
          ? `Protocolo ${targetProtocol.toUpperCase()} associado com sucesso.`
          : 'Solicitação desassociada do agrupamento.',
      );
      setTargetProtocol('');
      queryClient.setQueryData(['admin-occurrence-detail', id], updated);
      queryClient.invalidateQueries({ queryKey: ['admin-occurrences'] });
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Não foi possível alterar o agrupamento.'));
    }
  };

  if (isLoading || error || !occ) {
    return (
      <AdminLayout>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/admin/solicitacoes')}
            style={{ minHeight: 44, padding: '0 var(--space-3)' }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Voltar para solicitações</span>
          </Button>
        </div>
        {isLoading ? (
          <LoadingBlock label="Carregando solicitação..." />
        ) : (
          <ErrorBlock
            error={error}
            onRetry={() => refetch()}
            fallback="Solicitação não encontrada."
          />
        )}
      </AdminLayout>
    );
  }

  const isClosed =
    occ.status === OccurrenceStatus.DONE || occ.status === OccurrenceStatus.REJECTED;
  const canReopen =
    user?.role === UserRole.MANAGER || user?.role === UserRole.ADMIN;
  const reopenBlocked = isClosed && !canReopen && status !== occ.status;
  const nothingChanged =
    status === occ.status &&
    priority === occ.priority &&
    departmentId === occ.departmentId &&
    justification.trim().length === 0;

  return (
    <AdminLayout>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate('/admin/solicitacoes')}
          style={{ minHeight: 44, padding: '0 var(--space-3)' }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Voltar para solicitações</span>
        </Button>
      </div>

      {/* Cabeçalho com Protocolo, Título, Badges de Prioridade e Estado */}
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
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-h2)',
              fontWeight: 700,
              color: 'var(--brand)',
              marginBottom: 4,
            }}
          >
            {occ.protocol}
          </div>
          <h1 className="h1">{occ.title}</h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <PriorityBadge priority={occ.priority} />
          <StatusBadge status={occ.status} />
        </div>
      </div>

      {feedback && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="info">{feedback}</Notice>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Notice variant="danger">{errorMsg}</Notice>
        </div>
      )}

      {/* Duas Colunas: Esquerda (Detalhes, Semelhantes, Histórico) | Direita (Formulário Tratar Ocorrência) */}
      <div
        className="r-grid"
        style={{ '--cols': 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 'var(--space-5)' } as React.CSSProperties}
      >
        {/* COLUNA ESQUERDA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Cartão Detalhes */}
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              Detalhes
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-3)',
                fontSize: 'var(--fs-small)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <div>
                <div style={{ color: 'var(--ink-muted)' }}>Categoria</div>
                <strong>{occ.categoryName}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--ink-muted)' }}>Registrada em</div>
                <strong className="mono">
                  {new Date(occ.createdAt).toLocaleString('pt-BR')}
                </strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ color: 'var(--ink-muted)' }}>Local</div>
                <strong>
                  {occ.addressText} — Bairro {occ.neighborhood}
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
                Descrição do relato
              </div>
              <p style={{ margin: '4px 0 0 0' }}>{occ.description}</p>
            </div>

            {/* Dados do solicitante: visíveis apenas no painel administrativo */}
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--surface-300)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--fs-small)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <div style={{ color: 'var(--ink-muted)', marginBottom: 2 }}>
                Solicitante (dado pessoal — uso restrito ao atendimento)
              </div>
              <strong>{occ.requesterName || 'Não identificado'}</strong>
              {occ.requesterContact ? ` · ${occ.requesterContact}` : ''}
              {occ.hasAccount ? ' · possui conta' : ' · registro sem conta'}
              {occ.assistedByName
                ? ` · registro assistido por ${occ.assistedByName}`
                : ''}
            </div>

            {/* Fotos do registro */}
            {occ.photos?.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                {occ.photos.map((p: any, i: number) => (
                  <a
                    key={p.id}
                    href={assetUrl(p.url)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir foto ${i + 1} do relato em nova aba`}
                  >
                    <img
                      src={assetUrl(p.thumbUrl || p.url)}
                      alt={`Foto ${i + 1} do relato ${occ.protocol}`}
                      style={{
                        width: '100%',
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--line)',
                      }}
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontSize: 'var(--fs-small)',
                  color: 'var(--ink-muted)',
                  marginTop: 0,
                }}
              >
                Nenhuma foto anexada a este relato.
              </p>
            )}

            {/* Mini-mapa */}
            <InteractiveMap
              center={[occ.latitude, occ.longitude]}
              zoom={15}
              height={180}
              pickerPosition={[occ.latitude, occ.longitude]}
              ariaLabel={`Mini-mapa da solicitação ${occ.protocol}`}
            />
          </Card>

          {/* Cartão Registros Semelhantes (Seção 8.12) */}
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-2)',
              }}
            >
              <h2 className="h3">Registros semelhantes</h2>
              <span
                className="cf-badge"
                style={{
                  backgroundColor: 'var(--brand-soft)',
                  color: 'var(--brand)',
                }}
              >
                {occ.similarCount} associados
              </span>
            </div>

            <p
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--ink-muted)',
                marginTop: 0,
              }}
            >
              Cada cidadão mantém o próprio protocolo e recebe as mesmas atualizações.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-3)',
              }}
            >
              {occ.similarProtocols.length === 0 && (
                <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-muted)' }}>
                  Nenhum relato semelhante associado.
                </span>
              )}
              {occ.similarProtocols.map((sim: any) => (
                <Link
                  key={sim.id}
                  to={`/admin/solicitacoes/${sim.id}`}
                  className="cf-chip mono"
                  style={{
                    minHeight: 36,
                    padding: '0 12px',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  {sim.protocol}
                </Link>
              ))}
            </div>

            {/* Associar / Desassociar manualmente */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                borderTop: '1px solid var(--line)',
                paddingTop: 'var(--space-3)',
              }}
            >
              <input
                type="text"
                className="cf-input mono"
                style={{ flex: '1 1 160px', minHeight: 44 }}
                value={targetProtocol}
                onChange={(e) => setTargetProtocol(e.target.value)}
                placeholder="Protocolo (ex.: CF-2026-004819)"
                aria-label="Protocolo para associar manualmente"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleGroupAction('link')}
                style={{ minHeight: 44 }}
              >
                <Link2 size={16} aria-hidden="true" />
                <span>Associar</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleGroupAction('unlink')}
                disabled={!occ.groupId}
                style={{ minHeight: 44 }}
              >
                <Unlink size={16} aria-hidden="true" />
                <span>Desassociar</span>
              </Button>
            </div>
          </Card>

          {/* Cartão Histórico */}
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              Histórico
            </h2>
            <Timeline items={occ.history || []} />
          </Card>
        </div>

        {/* COLUNA DIREITA: FORMULÁRIO TRATAR OCORRÊNCIA */}
        <Card style={{ position: 'sticky', top: 'var(--space-5)' }}>
          <h2 className="h3" style={{ marginBottom: 'var(--space-4)' }}>
            Tratar ocorrência
          </h2>

          <form onSubmit={handleSave}>
            <Field label="Estado (7 opções)" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OccurrenceStatus)}
                >
                  {Object.entries(OCCURRENCE_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Prioridade" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as OccurrencePriority)
                  }
                >
                  {Object.entries(OCCURRENCE_PRIORITY_LABELS).map(
                    ([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              )}
            </Field>

            <Field label="Encaminhar para (departamento)" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departments
                    .filter((dept) => dept.active || dept.id === occ.departmentId)
                    .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {reopenBlocked && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Notice variant="warning">
                  Solicitações Concluídas ou Não procedentes só podem ser reabertas por Gestor ou Administrador.
                </Notice>
              </div>
            )}

            {isRejectedSelected && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Notice variant="danger">
                  Para Não procedente, a justificativa é obrigatória e fica visível ao cidadão.
                </Notice>
              </div>
            )}

            <Field
              label="Justificativa"
              hint="O cidadão verá este texto"
              required={isRejectedSelected}
              error={
                isRejectedInvalid
                  ? 'Informe a justificativa técnica para classificar como Não procedente.'
                  : undefined
              }
            >
              {(props) => (
                <textarea
                  {...props}
                  className="cf-textarea"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Descreva a orientação, programação de atendimento ou motivo técnico..."
                />
              )}
            </Field>

            <p
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--ink-muted)',
                margin: '0 0 var(--space-4) 0',
              }}
            >
              Mudanças de estado e justificativas são enviadas a todos os cidadãos associados. Alterar apenas prioridade ou departamento não gera notificação.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={saving || isRejectedInvalid || reopenBlocked || nothingChanged}
              >
                {saving ? 'Salvando...' : 'Salvar e notificar'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => navigate('/admin/solicitacoes')}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AdminLayout>
  );
};
