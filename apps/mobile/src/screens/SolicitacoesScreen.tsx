import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MobileOccurrenceDetail, TOKENS } from '../theme/tokens';
import { ChipButton, FieldInput, NoticeBox, PrimaryButton, StatusBadge } from '../components/MobileDesignSystem';
import { LoadState } from '../components/LoadState';
import { apiFetch, errorMessage } from '../lib/api';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function SolicitacoesScreen() {
  const {
    setScreen, user, highContrastPref, myOccurrences, myLoading, myError,
    reqFilterChip, setReqFilterChip, reqSearchQ, setReqSearchQ, protocolQuery,
    setProtocolQuery, protocolLookupResult, setProtocolLookupResult,
    protocolLookupError, setProtocolLookupError, protocolLookupBusy,
    setProtocolLookupBusy, scale, loadMine, openDetail,
  } = useApp();

  // Lista da conta, já filtrada pelo servidor (GET /me/occurrences)
  const filteredList = myOccurrences;

  const handleLookupByProtocol = async () => {
    const protocol = protocolQuery.trim().toUpperCase();
    if (!protocol) return;
    setProtocolLookupError(null);
    setProtocolLookupResult(null);
    setProtocolLookupBusy(true);
    try {
      const found = await apiFetch<MobileOccurrenceDetail>(
        `/occurrences/by-protocol/${encodeURIComponent(protocol)}`,
      );
      setProtocolLookupResult(found);
    } catch (err) {
      setProtocolLookupError(
        errorMessage(err, `Não foi possível consultar o protocolo ${protocol}.`),
      );
    } finally {
      setProtocolLookupBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.h2, { fontSize: 20 * scale }]}>
        Solicitações
      </Text>

      {/* Consultar por protocolo (destaque para quem não tem conta) */}
      <View style={styles.card}>
        <FieldInput
          label="Consultar por protocolo (sem necessidade de conta)"
          value={protocolQuery}
          onChangeText={setProtocolQuery}
          placeholder="Ex.: CF-2026-004812"
          scale={scale}
        />
        <PrimaryButton
          label={protocolLookupBusy ? 'Consultando...' : '🔍 Consultar protocolo'}
          variant="secondary"
          disabled={protocolLookupBusy}
          onPress={handleLookupByProtocol}
          scale={scale}
        />
        {protocolLookupError && (
          <View style={{ marginTop: 10 }}>
            <NoticeBox variant="danger" scale={scale}>
              {protocolLookupError}
            </NoticeBox>
          </View>
        )}
        {protocolLookupResult && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => openDetail(protocolLookupResult.protocol)}
            style={[
              styles.reviewBlock,
              { marginTop: 12, backgroundColor: TOKENS.brandSoft },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.monoText}>
                {protocolLookupResult.protocol}
              </Text>
              <Text style={{ fontWeight: '700' }}>
                {protocolLookupResult.title}
              </Text>
            </View>
            <StatusBadge
              status={protocolLookupResult.status}
              highContrast={highContrastPref}
              scale={scale}
            />
          </TouchableOpacity>
        )}
      </View>

      {!user && (
        <View style={[styles.card, { gap: 10 }]}>
          <Text style={[styles.h3, { fontSize: 16 * scale }]}>
            Entre para ver suas solicitações
          </Text>
          <Text style={[styles.mutedText, { fontSize: 13 * scale }]}>
            Sem conta, acompanhe qualquer solicitação pelo número do protocolo, no campo acima.
          </Text>
          <PrimaryButton
            label="Entrar ou criar conta"
            onPress={() => setScreen('entrar')}
            scale={scale}
          />
        </View>
      )}

      {user && (
        <>
      <FieldInput
        label="Buscar na lista"
        value={reqSearchQ}
        onChangeText={setReqSearchQ}
        placeholder="Filtrar por protocolo ou título..."
        scale={scale}
      />

      {/* Chips de filtro: Todas, Em aberto, Concluídas, Não procedentes */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipButton
          label="Todas"
          active={reqFilterChip === 'all'}
          onPress={() => setReqFilterChip('all')}
          scale={scale}
        />
        <ChipButton
          label="Em aberto"
          active={reqFilterChip === 'open'}
          onPress={() => setReqFilterChip('open')}
          scale={scale}
        />
        <ChipButton
          label="Concluídas"
          active={reqFilterChip === 'done'}
          onPress={() => setReqFilterChip('done')}
          scale={scale}
        />
        <ChipButton
          label="Não procedentes"
          active={reqFilterChip === 'rejected'}
          onPress={() => setReqFilterChip('rejected')}
          scale={scale}
        />
      </ScrollView>

      <LoadState loading={myLoading && filteredList.length === 0} error={myError} onRetry={loadMine} scale={scale} />

      {myError || (myLoading && filteredList.length === 0) ? null : filteredList.length === 0 ? (
        <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
          <Text style={[styles.h3, { marginBottom: 8 }]}>
            Nenhuma solicitação neste filtro
          </Text>
          <PrimaryButton
            label="Registrar problema"
            onPress={() => setScreen('registrar')}
            scale={scale}
          />
        </View>
      ) : (
        filteredList.map((occ) => (
          <TouchableOpacity
            key={occ.id}
            accessibilityRole="button"
            onPress={() => openDetail(occ.id)}
            style={styles.card}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.monoText}>{occ.protocol}</Text>
              <StatusBadge
                status={occ.status}
                highContrast={highContrastPref}
                scale={scale}
              />
            </View>
            <Text
              style={{
                fontWeight: '700',
                color: TOKENS.ink,
                marginTop: 6,
                fontSize: 15 * scale,
              }}
            >
              {occ.categoryName} — {occ.title}
            </Text>
            <Text
              style={[
                styles.mutedText,
                { fontSize: 12 * scale, marginTop: 4 },
              ]}
            >
              {occ.neighborhood} ·{' '}
              {new Date(occ.createdAt).toLocaleDateString('pt-BR')}
            </Text>
          </TouchableOpacity>
        ))
      )}
        </>
      )}
    </ScrollView>
  );
}
