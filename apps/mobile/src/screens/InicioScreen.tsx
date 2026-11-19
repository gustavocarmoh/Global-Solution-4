import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { categoryEmoji, TOKENS } from '../theme/tokens';
import { EmergencyBanner, NoticeBox, PrimaryButton, StatusBadge } from '../components/MobileDesignSystem';
import { LoadState } from '../components/LoadState';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function InicioScreen() {
  const {
    setScreen, user, highContrastPref, categories, categoriesError, lastOccurrence,
    recentOccurrences, homeLoading, homeError, setRegStep, setRegCategoryId,
    setCreatedOccurrence, scale, loadCategories, loadHome, openDetail,
  } = useApp();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Saudação */}
      <View style={styles.rowBetween}>
        <View>
          <Text style={[styles.h2, { fontSize: 20 * scale }]}>
            {user ? `Olá, ${user.name.split(' ')[0]}` : 'Olá, cidadão(ã)'}
          </Text>
          <Text style={[styles.mutedText, { fontSize: 13 * scale }]}>
            Cidade em Foco — Zeladoria Urbana
          </Text>
        </View>
        {!user && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setScreen('entrar')}
            style={styles.smallLinkBtn}
          >
            <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
              Entrar
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <EmergencyBanner scale={scale} />

      {/* Botão grande Registrar problema */}
      <PrimaryButton
        label="➕ Registrar problema"
        onPress={() => {
          setCreatedOccurrence(null);
          setRegStep(1);
          setScreen('registrar');
        }}
        scale={scale}
      />

      {/* Grade das 7 categorias com atalho Ver no mapa */}
      <View>
        <View style={[styles.rowBetween, { marginBottom: 10 }]}>
          <Text style={[styles.h3, { fontSize: 17 * scale }]}>
            Categorias
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setScreen('mapa')}
            style={styles.smallLinkBtn}
          >
            <Text
              style={{
                color: TOKENS.brand,
                fontWeight: '700',
                fontSize: 13 * scale,
              }}
            >
              Ver no mapa →
            </Text>
          </TouchableOpacity>
        </View>

        {categoriesError && (
          <View style={{ gap: 8, marginBottom: 10 }}>
            <NoticeBox variant="danger" scale={scale}>
              {categoriesError}
            </NoticeBox>
            <PrimaryButton
              label="Tentar novamente"
              variant="secondary"
              onPress={loadCategories}
              scale={scale}
            />
          </View>
        )}
        <View style={styles.categoriesGrid}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              accessibilityRole="button"
              accessibilityLabel={`Registrar problema na categoria ${cat.name}`}
              onPress={() => {
                setRegCategoryId(cat.id);
                setCreatedOccurrence(null);
                setRegStep(2);
                setScreen('registrar');
              }}
              style={styles.categoryCard}
            >
              <Text style={{ fontSize: 22 }}>{categoryEmoji(cat)}</Text>
              <Text
                style={{
                  fontWeight: '700',
                  color: TOKENS.ink,
                  fontSize: 13 * scale,
                  marginTop: 4,
                }}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Cartão Sua última solicitação */}
      {lastOccurrence && (
        <View>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 8 },
            ]}
          >
            Sua última solicitação
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => openDetail(lastOccurrence.id)}
            accessibilityLabel={`Sua última solicitação, protocolo ${lastOccurrence.protocol}`}
            style={styles.card}
          >
            <View style={styles.rowBetween}>
              <Text style={[styles.monoText, { fontSize: 14 * scale }]}>
                {lastOccurrence.protocol}
              </Text>
              <StatusBadge
                status={lastOccurrence.status}
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
              {lastOccurrence.categoryName} — {lastOccurrence.title}
            </Text>
            <Text
              style={[
                styles.mutedText,
                { fontSize: 13 * scale, marginTop: 2 },
              ]}
            >
              {lastOccurrence.addressText}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Seção Perto de você */}
      <View>
        <Text
          style={[
            styles.h3,
            { fontSize: 17 * scale, marginBottom: 8 },
          ]}
        >
          Registros recentes na cidade
        </Text>
        <LoadState loading={homeLoading} error={homeError} onRetry={loadHome} scale={scale} />
        {!homeLoading && !homeError && recentOccurrences.length === 0 && (
          <Text style={[styles.mutedText, { fontSize: 13 * scale }]}>
            Nenhuma ocorrência em aberto no momento.
          </Text>
        )}
        {recentOccurrences.map((occ) => (
          <TouchableOpacity
            key={occ.id}
            accessibilityRole="button"
            onPress={() => openDetail(occ.id)}
            style={[styles.card, { marginBottom: 10 }]}
          >
            <View style={styles.rowBetween}>
              <Text
                style={{
                  fontWeight: '700',
                  color: TOKENS.ink,
                  fontSize: 14 * scale,
                }}
              >
                {occ.categoryName} · {occ.neighborhood}
              </Text>
              <StatusBadge
                status={occ.status}
                highContrast={highContrastPref}
                scale={scale}
              />
            </View>
            <Text
              style={[
                styles.mutedText,
                { fontSize: 13 * scale, marginTop: 4 },
              ]}
            >
              {occ.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
