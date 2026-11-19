import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
  LocateFixed,
  Search,
  Trash2,
} from 'lucide-react';
import { NEIGHBORHOODS } from '@cidade-em-foco/shared';
import {
  Button,
  Card,
  EmergencyBanner,
  ErrorBlock,
  Field,
  LoadingBlock,
  Notice,
  Stepper,
} from '../../components/DesignSystem';
import { PublicHeader } from '../../components/PublicHeader';
import { CategoryIcon } from '../../components/CategoryIcons';
import { InteractiveMap } from '../../components/InteractiveMap';
import { apiFetch, errorMessage } from '../../lib/api';
import {
  NEIGHBORHOOD_CENTERS,
  useCategories,
} from '../../lib/queries';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Bairro cujo centro está mais próximo do ponto escolhido no mapa. */
function nearestNeighborhood(lat: number, lng: number): string {
  let best = Object.keys(NEIGHBORHOOD_CENTERS)[0];
  let bestDist = Infinity;
  for (const [name, [cLat, cLng]] of Object.entries(NEIGHBORHOOD_CENTERS)) {
    const dist = (lat - cLat) ** 2 + (lng - cLng) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}

const DRAFT_STORAGE_KEY = 'cf_occurrence_draft_v1';

interface DraftData {
  categoryId: string;
  description: string;
  referencePoint: string;
  addressText: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  requesterName: string;
  requesterContact: string;
}

export const CitizenRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  const [step, setStep] = useState<number>(1);
  const [draft, setDraft] = useState<DraftData>(() => {
    const initialCat = searchParams.get('categoryId') || '';
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          categoryId: initialCat || parsed.categoryId || '',
        };
      }
    } catch {
      // ignora erro de leitura
    }
    return {
      categoryId: initialCat,
      description: '',
      referencePoint: '',
      addressText: '',
      neighborhood: 'Centro',
      latitude: -23.5505,
      longitude: -46.6333,
      requesterName: '',
      requesterContact: '',
    };
  });

  // Para onde o mapa olha: muda com GPS, busca de endereço e troca de bairro, mas não a cada clique
  // (clicar não deve fazer o mapa "pular" debaixo do cursor)
  const [mapFocus, setMapFocus] = useState<[number, number]>([draft.latitude, draft.longitude]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);

  const [createdResult, setCreatedResult] = useState<{
    id: string;
    protocol: string;
    groupedWithSimilar?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Salva rascunho no aparelho automaticamente
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignora erro de quota
    }
  }, [draft]);

  const selectedCategory = categories.find((c: any) => c.id === draft.categoryId);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const incoming = Array.from(fileList);
    e.target.value = '';
    if (photos.length + incoming.length > 5) {
      setStepError('Você pode adicionar no máximo 5 fotos (até 5 MB cada).');
      return;
    }
    if (incoming.some((f) => !ACCEPTED_PHOTO_TYPES.includes(f.type))) {
      setStepError('Formato de imagem inválido. Envie apenas JPEG, PNG ou WebP.');
      return;
    }
    if (incoming.some((f) => f.size > MAX_PHOTO_BYTES)) {
      setStepError('Cada foto pode ter no máximo 5 MB.');
      return;
    }
    setStepError(null);
    setPhotos((prev) => [...prev, ...incoming]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUseGps = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          setStepError(null);
          setMapFocus([lat, lng]);
          setDraft((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            neighborhood: nearestNeighborhood(lat, lng),
          }));
        },
        () => {
          setStepError(
            'Não foi possível obter o GPS automaticamente. Toque no mapa ou digite o endereço.',
          );
        },
      );
    }
  };

  const handleNominatimSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchingAddress(true);
    setStepError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery,
        )}&limit=1`,
      );
      const data = await res.json();
      if (data && data[0]) {
        const lat = Number(parseFloat(data[0].lat).toFixed(6));
        const lng = Number(parseFloat(data[0].lon).toFixed(6));
        setMapFocus([lat, lng]);
        setDraft((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          neighborhood: nearestNeighborhood(lat, lng),
          addressText: data[0].display_name.split(',').slice(0, 2).join(','),
        }));
      } else {
        setStepError(
          'Endereço não encontrado. Ajuste a busca ou toque no mapa e digite o endereço.',
        );
      }
    } catch {
      setStepError(
        'A busca de endereços está indisponível. Toque no mapa e digite o endereço manualmente.',
      );
    } finally {
      setSearchingAddress(false);
    }
  };

  const validateAndAdvance = (targetStep: number) => {
    setStepError(null);
    if (step === 1 && targetStep > 1) {
      if (!draft.categoryId) {
        setStepError('Selecione uma das 7 categorias para continuar.');
        return;
      }
    }
    if (step === 2 && targetStep > 2) {
      if (draft.description.trim().length < 10) {
        setStepError(
          'A descrição deve ter no mínimo 10 caracteres para orientar a triagem.',
        );
        return;
      }
    }
    if (step === 3 && targetStep > 3) {
      if (draft.addressText.trim().length < 5 || !draft.neighborhood.trim()) {
        setStepError('Informe o endereço (mínimo de 5 caracteres) e o bairro da ocorrência.');
        return;
      }
    }
    setStep(targetStep);
  };

  const handleSubmitOccurrence = async () => {
    setStepError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('categoryId', draft.categoryId);
      formData.append('description', draft.description.trim());
      if (draft.referencePoint.trim()) {
        formData.append('referencePoint', draft.referencePoint.trim());
      }
      formData.append('addressText', draft.addressText.trim());
      formData.append('neighborhood', draft.neighborhood.trim());
      formData.append('latitude', String(draft.latitude));
      formData.append('longitude', String(draft.longitude));
      if (draft.requesterName.trim()) {
        formData.append('requesterName', draft.requesterName.trim());
      }
      if (draft.requesterContact.trim()) {
        formData.append('requesterContact', draft.requesterContact.trim());
      }
      for (const file of photos) {
        formData.append('photos', file);
      }

      const res = await apiFetch('/occurrences', {
        method: 'POST',
        body: formData,
      });

      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setCreatedResult({
        id: res.id,
        protocol: res.protocol,
        groupedWithSimilar: res.groupedWithSimilar,
      });
      queryClient.invalidateQueries({ queryKey: ['my-occurrences'] });
      queryClient.invalidateQueries({ queryKey: ['public-map'] });
    } catch (err) {
      setStepError(
        `${errorMessage(err, 'Não foi possível enviar a solicitação.')} Seu rascunho continua salvo neste aparelho.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyProtocol = async () => {
    if (!createdResult?.protocol) return;
    try {
      await navigator.clipboard.writeText(createdResult.protocol);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
    }
  };

  if (createdResult) {
    return (
      <div className="citizen-shell">
        <PublicHeader />
        <main
          id="main-content"
          className="public-narrow"
          style={{
            padding: 'var(--space-5) var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <EmergencyBanner />
          <Card style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'var(--brand-soft)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-3) auto',
              }}
            >
              <CheckCircle2 size={36} aria-hidden="true" />
            </div>

            <h1 className="h1" style={{ marginBottom: 'var(--space-2)' }}>
              Solicitação registrada
            </h1>
            <p style={{ color: 'var(--ink-muted)', margin: '0 0 var(--space-4) 0' }}>
              {draft.requesterContact.includes('@')
                ? 'Você será avisado a cada mudança de estado. '
                : ''}
              Guarde o número do seu protocolo para acompanhar o andamento:
            </p>

            <div
              className="mono"
              style={{
                fontSize: 'var(--fs-h1)',
                fontWeight: 700,
                padding: 'var(--space-3)',
                backgroundColor: 'var(--surface-300)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-3)',
                color: 'var(--brand)',
              }}
            >
              {createdResult.protocol}
            </div>

            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleCopyProtocol}
            >
              <Copy size={18} aria-hidden="true" />
              <span>{copied ? 'Protocolo copiado!' : 'Copiar protocolo'}</span>
            </Button>

            {createdResult.groupedWithSimilar && (
              <div style={{ marginTop: 'var(--space-3)', textAlign: 'left' }}>
                <Notice variant="info">
                  Outros relatos semelhantes na mesma área foram associados: você mantém seu próprio protocolo e recebe todas as atualizações.
                </Notice>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-5)',
              }}
            >
              <Button
                type="button"
                variant="primary"
                fullWidth
                onClick={() => navigate(`/solicitacoes/${createdResult.protocol}`)}
              >
                Acompanhar
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => {
                  setCreatedResult(null);
                  setStep(1);
                  setDraft((prev) => ({
                    ...prev,
                    categoryId: '',
                    description: '',
                    referencePoint: '',
                  }));
                  setPhotos([]);
                }}
              >
                Registrar outro
              </Button>
            </div>
          </Card>
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
        <EmergencyBanner />

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}
            style={{ minHeight: 44, padding: '0 var(--space-3)' }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Voltar</span>
          </Button>
          <h1 className="h2">Registrar solicitação</h1>
        </div>

        <Stepper
          currentStep={step}
          steps={['Categoria', 'Descrição', 'Localização', 'Revisão']}
        />

        {stepError && <Notice variant="danger">{stepError}</Notice>}

        {/* PASSO 1: CATEGORIA */}
        {step === 1 && (
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              1. Qual é a categoria do problema?
            </h2>
            {categoriesQuery.isLoading && (
              <LoadingBlock label="Carregando categorias..." />
            )}
            {categoriesQuery.error && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <ErrorBlock
                  error={categoriesQuery.error}
                  onRetry={() => categoriesQuery.refetch()}
                />
              </div>
            )}
            <div
              role="radiogroup"
              aria-label="Categorias de zeladoria"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {categories.map((cat: any) => {
                const selected = draft.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, categoryId: cat.id }))
                    }
                    className="cf-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 'var(--space-2)',
                      cursor: 'pointer',
                      minHeight: 88,
                      borderColor: selected ? 'var(--brand)' : 'var(--line)',
                      borderWidth: selected ? 2 : 1,
                      backgroundColor: selected
                        ? 'var(--brand-soft)'
                        : 'var(--surface-200)',
                    }}
                  >
                    <CategoryIcon icon={cat.icon} slug={cat.slug} size={22} />
                    <span style={{ fontWeight: 700, fontSize: 'var(--fs-small)' }}>
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => validateAndAdvance(2)}
            >
              Continuar para descrição
            </Button>
          </Card>
        )}

        {/* PASSO 2: DESCRIÇÃO E FOTOS */}
        {step === 2 && (
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              2. Descreva o problema e adicione fotos
            </h2>

            <Field
              label="Descrição do problema"
              required
              hint={`Mínimo de 10 caracteres (${draft.description.length}/2000)`}
            >
              {(props) => (
                <textarea
                  {...props}
                  className="cf-textarea"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Descreva o que está acontecendo para auxiliar a triagem da prefeitura..."
                  maxLength={2000}
                />
              )}
            </Field>

            <Field label="Ponto de referência (opcional)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={draft.referencePoint}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, referencePoint: e.target.value }))
                  }
                  placeholder="Ex.: Em frente à escola municipal ou próximo ao nº 400"
                />
              )}
            </Field>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div className="cf-label" style={{ marginBottom: 6 }}>
                Fotos (opcional — até 5 fotos de 5 MB)
              </div>
              <label
                htmlFor="photo-upload-input"
                className="cf-btn cf-btn-secondary"
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <Camera size={18} aria-hidden="true" />
                <span>Adicionar foto (câmera ou galeria)</span>
              </label>
              <input
                id="photo-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />

              {photos.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-2)',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  {photos.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      style={{
                        padding: 'var(--space-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="cf-btn cf-btn-ghost"
                        style={{ minHeight: 36, padding: 4, color: 'var(--status-rejected-fg)' }}
                        aria-label={`Remover foto ${file.name}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        <span>Remover</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => validateAndAdvance(3)}
            >
              Continuar para localização
            </Button>
          </Card>
        )}

        {/* PASSO 3: LOCALIZAÇÃO */}
        {step === 3 && (
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              3. Onde fica o problema?
            </h2>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={handleUseGps}
              >
                <LocateFixed size={18} aria-hidden="true" />
                <span>Usar minha localização (GPS)</span>
              </Button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <input
                type="search"
                className="cf-input"
                style={{ flex: 1 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar rua ou endereço..."
                aria-label="Buscar endereço no mapa"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleNominatimSearch}
                disabled={searchingAddress}
              >
                <Search size={18} aria-hidden="true" />
                <span>Buscar</span>
              </Button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 0 }}>
              Toque no mapa para ajustar a posição exata do marcador:
            </p>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <InteractiveMap
                center={mapFocus}
                zoom={15}
                height={240}
                pickerPosition={[draft.latitude, draft.longitude]}
                onPickLocation={(lat, lng) =>
                  setDraft((prev) => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    neighborhood: nearestNeighborhood(lat, lng),
                  }))
                }
              />
            </div>

            <Field label="Endereço ou altura aproximada" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="cf-input"
                  value={draft.addressText}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, addressText: e.target.value }))
                  }
                  placeholder="Ex.: Rua Quinze de Novembro, 412"
                  required
                />
              )}
            </Field>

            <Field label="Bairro" hint="Detectado pela posição no mapa; ajuste se necessário" required>
              {(props) => (
                <select
                  {...props}
                  className="cf-select"
                  value={draft.neighborhood}
                  onChange={(e) => {
                    const nb = e.target.value;
                    const center = NEIGHBORHOOD_CENTERS[nb];
                    if (center && nearestNeighborhood(draft.latitude, draft.longitude) !== nb) {
                      setMapFocus(center);
                    }
                    setDraft((prev) => ({
                      ...prev,
                      neighborhood: nb,
                      // Trocar o bairro manualmente reposiciona o marcador no centro dele
                      ...(center && nearestNeighborhood(prev.latitude, prev.longitude) !== nb
                        ? { latitude: center[0], longitude: center[1] }
                        : {}),
                    }));
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

            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => validateAndAdvance(4)}
            >
              Revisar solicitação
            </Button>
          </Card>
        )}

        {/* PASSO 4: REVISÃO */}
        {step === 4 && (
          <Card>
            <h2 className="h3" style={{ marginBottom: 'var(--space-3)' }}>
              4. Revise os dados antes de enviar
            </h2>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--surface-300)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Categoria</div>
                  <div style={{ fontWeight: 700 }}>{selectedCategory?.name}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  style={{ minHeight: 44, padding: '0 var(--space-3)' }}
                >
                  Editar
                </Button>
              </div>

              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--surface-300)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    Descrição e fotos ({photos.length} anexada{photos.length === 1 ? '' : 's'})
                  </div>
                  <div style={{ fontSize: 'var(--fs-small)' }}>{draft.description}</div>
                  {draft.referencePoint && (
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                      Ref.: {draft.referencePoint}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  style={{ minHeight: 44, padding: '0 var(--space-3)' }}
                >
                  Editar
                </Button>
              </div>

              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--surface-300)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Localização</div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>
                    {draft.addressText} — {draft.neighborhood}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(3)}
                  style={{ minHeight: 44, padding: '0 var(--space-3)' }}
                >
                  Editar
                </Button>
              </div>
            </div>

            <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: 'var(--space-3)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <h3 className="h3" style={{ marginBottom: 4 }}>
                  Receber atualizações (opcional)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 0 }}>
                  Você pode registrar sem conta e acompanhar só pelo protocolo, ou informar um contato para ser avisado.
                </p>

                <Field label="Seu nome (opcional)">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className="cf-input"
                      value={draft.requesterName}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, requesterName: e.target.value }))
                      }
                      placeholder="Como prefere ser chamado(a)"
                    />
                  )}
                </Field>

                <Field label="E-mail ou telefone para aviso (opcional, protegido pela LGPD)">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className="cf-input"
                      value={draft.requesterContact}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          requesterContact: e.target.value,
                        }))
                      }
                      placeholder="seu.email@exemplo.com.br"
                    />
                  )}
                </Field>
              </div>

            <Notice variant="info">
              A plataforma organiza a comunicação, a triagem e o encaminhamento à secretaria responsável. Acompanhe cada etapa pelo protocolo.
            </Notice>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <Button
                type="button"
                variant="primary"
                fullWidth
                disabled={submitting}
                onClick={handleSubmitOccurrence}
              >
                {submitting ? 'Enviando solicitação...' : 'Enviar solicitação'}
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};
