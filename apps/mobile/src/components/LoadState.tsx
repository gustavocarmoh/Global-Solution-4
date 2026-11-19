import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { NoticeBox, PrimaryButton } from './MobileDesignSystem';

/** Indicador de carregamento e mensagem de erro com "Tentar novamente". */
export function LoadState({
  loading,
  error,
  onRetry,
  scale = 1,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  scale?: number;
}) {
  if (loading) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }} accessibilityRole="progressbar">
        <ActivityIndicator color={TOKENS.brand} />
        <Text style={{ color: TOKENS.inkMuted, marginTop: 6, fontSize: 13 * scale }}>
          Carregando...
        </Text>
      </View>
    );
  }
  if (!error) return null;
  return (
    <View style={{ gap: 8 }}>
      <NoticeBox variant="danger" scale={scale}>
        {error}
      </NoticeBox>
      <PrimaryButton
        label="Tentar novamente"
        variant="secondary"
        onPress={onRetry}
        scale={scale}
      />
    </View>
  );
}
