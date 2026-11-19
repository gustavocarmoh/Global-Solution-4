import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { OccurrenceStatus } from '@cidade-em-foco/shared';
import { TOKENS } from '../theme/tokens';
import { FieldInput, NoticeBox, PrimaryButton, StarsRating, StatusBadge } from '../components/MobileDesignSystem';
import { MobileMapCanvas } from '../components/MobileMapCanvas';
import { LoadState } from '../components/LoadState';
import { apiFetch, assetUrl, errorMessage } from '../lib/api';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function DetalheScreen() {
  const {
    setScreen, selectedOccurrenceRef, user, highContrastPref, detail, detailLoading,
    detailError, ratingStars, setRatingStars, ratingComment, setRatingComment,
    ratingError, setRatingError, ratingBusy, setRatingBusy, scale, loadDetail,
  } = useApp();

  const backButton = (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => setScreen('solicitacoes')}
      style={styles.smallOutlineBtn}
    >
      <Text style={{ fontWeight: '700', color: TOKENS.ink }}>
        ← Voltar para solicitações
      </Text>
    </TouchableOpacity>
  );

  if (!detail) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {backButton}
        <LoadState loading={detailLoading || !detailError} error={detailError} onRetry={loadDetail} scale={scale} />
      </ScrollView>
    );
  }
  const occ = detail;
  // Quem abriu pelo número do protocolo comprova que é o portador dele
  const arrivedByProtocol = selectedOccurrenceRef.toUpperCase().startsWith('CF-');
  const showRatingForm = occ.canRate && (occ.isMine || arrivedByProtocol);

  const handleSendRating = async () => {
    setRatingError(null);
    setRatingBusy(true);
    try {
      await apiFetch(`/occurrences/${occ.id}/rating`, {
        method: 'POST',
        body: JSON.stringify({
          stars: ratingStars,
          comment: ratingComment.trim() || undefined,
          protocol: occ.protocol,
        }),
      });
      await loadDetail();
    } catch (err) {
      setRatingError(errorMessage(err, 'Não foi possível enviar a avaliação.'));
    } finally {
      setRatingBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {backButton}

      {/* Cabeçalho com protocolo, título e StatusBadge */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={[styles.monoBig, { fontSize: 17 * scale }]}>
            {occ.protocol}
          </Text>
          <StatusBadge
            status={occ.status}
            highContrast={highContrastPref}
            scale={scale}
          />
        </View>
        <Text
          style={[
            styles.h2,
            { fontSize: 19 * scale, marginVertical: 8 },
          ]}
        >
          {occ.title}
        </Text>
        <Text style={[styles.mutedText, { fontSize: 13 * scale }]}>
          {occ.categoryName} · Secretaria: {occ.departmentName}
        </Text>
        <Text style={{ marginTop: 10, fontSize: 14 * scale }}>
          {occ.description}
        </Text>

        {occ.photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 12 }}
          >
            {occ.photos.map((photo, idx) => (
              <Image
                key={photo.id}
                source={{ uri: assetUrl(photo.thumbUrl || photo.url) }}
                accessibilityLabel={`Foto ${idx + 1} da solicitação ${occ.protocol}`}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 10,
                  marginRight: 8,
                  backgroundColor: TOKENS.brandSoft,
                }}
              />
            ))}
          </ScrollView>
        )}

        <View style={{ marginTop: 12 }}>
          <Text
            style={{
              fontWeight: '700',
              marginBottom: 6,
              fontSize: 13 * scale,
            }}
          >
            📍 Local: {occ.addressText} ({occ.neighborhood})
          </Text>
          <MobileMapCanvas
            center={{ latitude: occ.latitude, longitude: occ.longitude }}
            pins={[occ]}
            selectedPinId={occ.id}
            delta={0.01}
            height={160}
          />
        </View>
      </View>

      {/* Aviso de relatos semelhantes */}
      {occ.similarCount > 0 && (
        <NoticeBox variant="info" scale={scale}>
          👥 Outros relatos semelhantes foram associados: você recebe as
          mesmas atualizações (+{occ.similarCount} protocolos na mesma área).
        </NoticeBox>
      )}

      {/* Linha do tempo vertical com todos os estados */}
      <View style={styles.card}>
        <Text
          style={[
            styles.h3,
            { fontSize: 17 * scale, marginBottom: 12 },
          ]}
        >
          Histórico de estados
        </Text>
        {occ.history.map((h) => (
          <View key={h.id} style={styles.timelineItem}>
            <View style={styles.rowBetween}>
              <StatusBadge
                status={h.toStatus}
                highContrast={highContrastPref}
                scale={scale}
              />
              <Text style={{ fontSize: 11 * scale, color: TOKENS.inkMuted }}>
                {new Date(h.createdAt).toLocaleString('pt-BR')}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 12 * scale,
                color: TOKENS.inkMuted,
                marginTop: 4,
              }}
            >
              Responsável: {h.actorName || 'Atendimento Municipal'}
            </Text>
            {h.justification && (
              <View style={styles.justificationBox}>
                <Text style={{ fontSize: 13 * scale, color: TOKENS.ink }}>
                  {h.justification}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Quando Concluída: Bloco Avalie o atendimento */}
      {occ.status === OccurrenceStatus.DONE && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 8 },
            ]}
          >
            Avalie o atendimento
          </Text>
          {occ.rating ? (
            <NoticeBox variant="info" scale={scale}>
              ⭐ {occ.isMine ? 'Obrigado pela avaliação!' : 'Atendimento avaliado.'} (
              {occ.rating.stars} de 5 estrelas)
            </NoticeBox>
          ) : showRatingForm ? (
            <View style={{ gap: 12 }}>
              {ratingError && (
                <NoticeBox variant="danger" scale={scale}>
                  {ratingError}
                </NoticeBox>
              )}
              <StarsRating value={ratingStars} onChange={setRatingStars} />
              <FieldInput
                label="Comentário (opcional)"
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Conte como foi o atendimento..."
                multiline
                scale={scale}
              />
              <PrimaryButton
                label={ratingBusy ? 'Enviando...' : 'Enviar avaliação'}
                disabled={ratingBusy}
                onPress={handleSendRating}
                scale={scale}
              />
            </View>
          ) : (
            <Text style={[styles.mutedText, { fontSize: 13 * scale }]}>
              A avaliação é feita por quem registrou a solicitação.{' '}
              {occ.canRate
                ? 'Se foi você, consulte pelo número do protocolo em "Solicitações".'
                : !user
                  ? 'Se foi você, entre com a sua conta.'
                  : ''}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
