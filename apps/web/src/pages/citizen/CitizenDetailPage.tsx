import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react';
import { OccurrenceStatus } from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
  Stars,
} from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { StatusBadge } from '../../components/Badges';
import { Timeline } from '../../components/DataVisuals';
import { InteractiveMap } from '../../components/InteractiveMap';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';

export const CitizenDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Quem abre a página pelo número do protocolo comprova que é o portador dele
  const arrivedByProtocol = Boolean(id?.toUpperCase().startsWith('CF-'));

  const {
    data: occ,
    isLoading,
    error,
    refetch,
  } = useQuery<any>({
    queryKey: ['occurrence-detail', id],
    queryFn: async () => {
      if (id?.toUpperCase().startsWith('CF-')) {
        return apiFetch(`/occurrences/by-protocol/${encodeURIComponent(id)}`);
      }
      return apiFetch(`/occurrences/${id}`);
    },
  });

  const [stars, setStars] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [sendingRating, setSendingRating] = useState(false);

  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!occ) return;
    setRatingError(null);
    setSendingRating(true);
    try {
      await apiFetch(`/occurrences/${occ.id}/rating`, {
        method: 'POST',
        body: JSON.stringify({
          stars,
          comment: comment.trim() || undefined,
          // Quem chegou aqui consultando pelo protocolo comprova que é o portador dele
          protocol: occ.protocol,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['occurrence-detail', id] });
    } catch (err) {
      setRatingError(errorMessage(err, 'Erro ao enviar avaliação.'));
    } finally {
      setSendingRating(false);
    }
  };

  if (isLoading || error || !occ) {
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
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/solicitacoes')}
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
        </main>
      </div>
    );
  }

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
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/solicitacoes')}
            style={{ minHeight: 44, padding: '0 var(--space-3)' }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Voltar para solicitações</span>
          </Button>
        </div>

        {/* Cabeçalho com Protocolo, Título e StatusBadge */}
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-h3)',
                fontWeight: 700,
                color: 'var(--brand)',
              }}
            >
              {occ.protocol}
            </span>
            <StatusBadge status={occ.status} />
          </div>

          <h1 className="h2" style={{ marginBottom: 'var(--space-2)' }}>
            {occ.title}
          </h1>

          <div
            style={{
              fontSize: 'var(--fs-small)',
              color: 'var(--ink-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Categoria: <strong>{occ.categoryName}</strong> · Secretaria:{' '}
            <strong>{occ.departmentName}</strong>
          </div>

          <p style={{ margin: '0 0 var(--space-3) 0' }}>{occ.description}</p>

          {occ.photos && occ.photos.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-3)',
              }}
            >
              {occ.photos.map((photo: any) => (
                <img
                  key={photo.id}
                  src={assetUrl(photo.thumbUrl || photo.url)}
                  alt={`Foto registrada para o protocolo ${occ.protocol}`}
                  style={{
                    width: '100%',
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--line)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Localização com Mini-mapa */}
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-small)', marginBottom: 6 }}>
              Local: {occ.addressText} ({occ.neighborhood})
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>
              Posição aproximada: por privacidade, o ponto público é arredondado.
            </div>
            <InteractiveMap
              center={[occ.latitude, occ.longitude]}
              zoom={15}
              height={180}
              pickerPosition={[occ.latitude, occ.longitude]}
              ariaLabel={`Mini-mapa da ocorrência ${occ.protocol}`}
            />
          </div>
        </Card>

        {/* Aviso de Outros Relatos Semelhantes Associados (Regra 5 e Seção 8.6) */}
        {occ.similarCount > 0 && (
          <Notice variant="info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <Users size={16} aria-hidden="true" />
              <span>
                Outros relatos semelhantes foram associados: você recebe as mesmas atualizações.
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              Esta ocorrência faz parte de um agrupamento com mais{' '}
              <strong>{occ.similarCount}</strong> protocolo(s) na mesma área.
            </div>
          </Notice>
        )}

        {/* Linha do tempo vertical com todos os estados */}
        <Card>
          <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
            Histórico de andamento
          </h2>
          <Timeline items={occ.history || []} />
        </Card>

        {/* Bloco de Avaliação quando Concluída */}
        {occ.status === OccurrenceStatus.DONE && (
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-2)' }}>
              Avaliação do atendimento
            </h2>
            {occ.rating ? (
              <div
                role="status"
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--brand-soft)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--brand)',
                  fontWeight: 600,
                }}
              >
                <div>
                  {occ.isMine || occ.canRate === undefined
                    ? 'Obrigado pela avaliação!'
                    : 'Este atendimento foi avaliado.'}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Stars value={occ.rating.stars} readOnly />
                </div>
                {occ.rating.comment && (
                  <p
                    style={{
                      margin: '8px 0 0 0',
                      fontWeight: 400,
                      color: 'var(--ink)',
                      fontSize: 'var(--fs-small)',
                    }}
                  >
                    “{occ.rating.comment}”
                  </p>
                )}
              </div>
            ) : occ.canRate && arrivedByProtocol ? (
              <form onSubmit={handleRatingSubmit}>
                <p
                  style={{
                    fontSize: 'var(--fs-small)',
                    color: 'var(--ink-muted)',
                    marginTop: 0,
                  }}
                >
                  Sua opinião ajuda a prefeitura a medir e melhorar a qualidade dos serviços urbanos:
                </p>

                {ratingError && (
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <Notice variant="danger">{ratingError}</Notice>
                  </div>
                )}

                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <Stars value={stars} onChange={setStars} />
                </div>

                <Field label="Comentário (opcional)">
                  {(props) => (
                    <textarea
                      {...props}
                      className="cf-textarea"
                      style={{ minHeight: 84 }}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={500}
                      placeholder="Conte como foi o resultado do atendimento..."
                    />
                  )}
                </Field>

                <Button type="submit" variant="primary" fullWidth disabled={sendingRating}>
                  {sendingRating ? 'Enviando...' : 'Enviar avaliação'}
                </Button>
              </form>
            ) : (
              <p
                style={{
                  fontSize: 'var(--fs-small)',
                  color: 'var(--ink-muted)',
                  margin: 0,
                }}
              >
                A avaliação é feita por quem registrou a solicitação.{' '}
                {occ.canRate
                  ? 'Se foi você, consulte pelo número do protocolo em “Solicitações” para avaliar.'
                  : 'Quem tem conta avalia pelo aplicativo.'}
              </p>
            )}
          </Card>
        )}
      </main>
    </div>
  );
};
