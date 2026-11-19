import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from '../theme/tokens';
import type { MobileMapCanvasProps, MobileMapPin } from './MobileMapCanvas';

export type { MobileMapPin };

/**
 * Variante para o Expo Web: react-native-maps só existe em iOS/Android, então
 * aqui os mesmos dados da API são apresentados como painel acessível
 * (totais por bairro e marcadores tocáveis), sem mapa de fundo.
 */
export const MobileMapCanvas: React.FC<MobileMapCanvasProps> = ({
  center,
  pins = [],
  clusters = [],
  selectedPinId,
  onSelectPin,
  pickerCoord,
  height = 280,
}) => {
  return (
    <View
      accessibilityLabel="Painel do mapa com totais por bairro e marcadores de ocorrências"
      style={[styles.mapBox, { minHeight: height }]}
    >
      <Text style={styles.coordHeader}>
        Centro: {center.latitude.toFixed(3)}, {center.longitude.toFixed(3)} · o mapa
        interativo está disponível no app para Android e iOS
      </Text>

      {clusters.length > 0 && (
        <View style={styles.clusterRow}>
          {clusters.map((c) => (
            <View key={c.neighborhood} style={styles.clusterCol}>
              <View style={styles.clusterBubble}>
                <Text style={styles.clusterCount}>{c.count}</Text>
              </View>
              <Text style={styles.clusterLabel}>{c.neighborhood}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.pinsContainer}>
        {pins.slice(0, 24).map((pin) => {
          const isSelected = pin.id === selectedPinId;
          return (
            <TouchableOpacity
              key={pin.id}
              accessibilityRole="button"
              accessibilityLabel={`Marcador ${pin.categoryName} em ${pin.neighborhood}, protocolo ${pin.protocol}`}
              onPress={() => onSelectPin?.(pin)}
              style={[
                styles.pinPill,
                {
                  backgroundColor: isSelected ? TOKENS.sun : TOKENS.brand,
                  borderColor: isSelected ? TOKENS.ink : '#ffffff',
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? TOKENS.ink : '#ffffff',
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                📍 {pin.categoryName} ({pin.neighborhood})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {pickerCoord && (
        <View style={styles.pickerBox}>
          <Text style={styles.pickerTitle}>
            📍 Local selecionado: {pickerCoord.latitude.toFixed(5)},{' '}
            {pickerCoord.longitude.toFixed(5)}
          </Text>
          <Text style={styles.pickerHint}>
            Use o GPS, a busca de endereço ou escolha o bairro para reposicionar.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mapBox: {
    width: '100%',
    backgroundColor: '#e4efe9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.line,
    padding: 12,
    gap: 10,
  },
  coordHeader: { fontSize: 11, color: TOKENS.inkMuted },
  clusterRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 },
  clusterCol: { alignItems: 'center' },
  clusterBubble: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 6,
    borderRadius: 21,
    backgroundColor: TOKENS.brand,
    borderWidth: 3,
    borderColor: TOKENS.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  clusterLabel: { fontSize: 11, fontWeight: '600', color: TOKENS.ink, marginTop: 2 },
  pinsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pinPill: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: 'center',
  },
  pickerBox: {
    backgroundColor: TOKENS.surface200,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.brand,
  },
  pickerTitle: { fontSize: 12, fontWeight: '700', color: TOKENS.ink },
  pickerHint: { fontSize: 11, color: TOKENS.inkMuted, marginTop: 2 },
});
