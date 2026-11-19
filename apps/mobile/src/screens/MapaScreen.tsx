import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { NEIGHBORHOODS } from '@cidade-em-foco/shared';
import { CITY_CENTER, NEIGHBORHOOD_CENTERS, TOKENS } from '../theme/tokens';
import { ChipButton, NoticeBox, PrimaryButton, StatusBadge } from '../components/MobileDesignSystem';
import { MobileMapCanvas } from '../components/MobileMapCanvas';
import { LoadState } from '../components/LoadState';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function MapaScreen() {
  const {
    highContrastPref, categories, mapPoints, mapClusters, mapLoading, mapError,
    mapNeighborhood, setMapNeighborhood, mapCategorySlug, setMapCategorySlug,
    mapStatusFilter, setMapStatusFilter, mapViewAsList, setMapViewAsList, mapCenter,
    setMapCenter, selectedMapPinId, setSelectedMapPinId, scale, loadMap, openDetail,
    requestNativeGps,
  } = useApp();

  // Os filtros são aplicados pelo servidor (GET /map/occurrences)
  const filteredPoints = mapPoints;
  const totalInFilter = mapClusters.reduce((acc, c) => acc + c.count, 0);

  const selectedPin =
    filteredPoints.find((p) => p.id === selectedMapPinId) ||
    filteredPoints[0];

  const pickNeighborhood = (nb: string) => {
    setMapNeighborhood(nb);
    setMapCenter(nb ? NEIGHBORHOOD_CENTERS[nb] || CITY_CENTER : CITY_CENTER);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.rowBetween}>
        <Text style={[styles.h2, { fontSize: 20 * scale }]}>
          Mapa da cidade
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setMapViewAsList((v) => !v)}
          style={styles.smallOutlineBtn}
        >
          <Text style={{ fontWeight: '700', color: TOKENS.ink }}>
            {mapViewAsList ? '🗺️ Ver no mapa' : '📋 Ver como lista'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chips de filtro: Bairro, Categoria, Estado */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipButton
          label="Todos os bairros"
          active={mapNeighborhood === ''}
          onPress={() => pickNeighborhood('')}
          scale={scale}
        />
        {NEIGHBORHOODS.map((nb) => (
          <ChipButton
            key={nb}
            label={nb}
            active={mapNeighborhood === nb}
            onPress={() => pickNeighborhood(mapNeighborhood === nb ? '' : nb)}
            scale={scale}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipButton
          label="Todas categorias"
          active={mapCategorySlug === ''}
          onPress={() => setMapCategorySlug('')}
          scale={scale}
        />
        {categories.map((c) => (
          <ChipButton
            key={c.slug}
            label={c.name}
            active={mapCategorySlug === c.slug}
            onPress={() =>
              setMapCategorySlug(mapCategorySlug === c.slug ? '' : c.slug)
            }
            scale={scale}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipButton
          label="Todos estados"
          active={mapStatusFilter === ''}
          onPress={() => setMapStatusFilter('')}
          scale={scale}
        />
        <ChipButton
          label="Em aberto"
          active={mapStatusFilter === 'open'}
          onPress={() =>
            setMapStatusFilter(mapStatusFilter === 'open' ? '' : 'open')
          }
          scale={scale}
        />
      </ScrollView>

      {/* Nota fixa de privacidade LGPD */}
      <NoticeBox variant="info" scale={scale}>
        🔒 Os dados de quem registrou nunca aparecem no mapa.
      </NoticeBox>

      <LoadState loading={mapLoading} error={mapError} onRetry={loadMap} scale={scale} />
      {!mapLoading && !mapError && (
        <Text style={[styles.mutedText, { fontSize: 12 * scale }]}>
          {totalInFilter === 0
            ? 'Nenhuma ocorrência neste filtro.'
            : `Exibindo as ${filteredPoints.length} mais recentes de ${totalInFilter} ocorrências neste filtro.`}
        </Text>
      )}

      {!mapViewAsList ? (
        <>
          <MobileMapCanvas
            center={mapCenter}
            pins={filteredPoints}
            clusters={mapClusters}
            delta={mapNeighborhood ? 0.03 : 0.12}
            selectedPinId={selectedPin?.id || null}
            onSelectPin={(pin) => setSelectedMapPinId(pin.id)}
          />

          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 12 * scale, color: TOKENS.inkMuted }}>
              🟢 Ocorrência · 🟡 Selecionada · (N) total no bairro
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => requestNativeGps(false)}
              style={styles.smallOutlineBtn}
            >
              <Text style={{ fontWeight: '700', color: TOKENS.brand }}>
                📍 Minha localização
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cartão inferior ao tocar no pin */}
          {selectedPin && (
            <View
              style={[
                styles.card,
                { borderColor: TOKENS.brand, borderWidth: 2 },
              ]}
            >
              <View style={styles.rowBetween}>
                <Text
                  style={{
                    fontWeight: '700',
                    color: TOKENS.ink,
                    fontSize: 14 * scale,
                  }}
                >
                  {selectedPin.categoryName} · {selectedPin.neighborhood}
                </Text>
                <StatusBadge
                  status={selectedPin.status}
                  highContrast={highContrastPref}
                  scale={scale}
                />
              </View>
              <Text
                style={[
                  styles.mutedText,
                  { fontSize: 13 * scale, marginVertical: 6 },
                ]}
              >
                {selectedPin.title}
              </Text>
              <PrimaryButton
                label="Ver detalhes"
                onPress={() => openDetail(selectedPin.id)}
                scale={scale}
              />
            </View>
          )}
        </>
      ) : (
        /* Alternativa acessível: Ver como lista */
        <View style={{ gap: 10 }}>
          {filteredPoints.map((pt) => (
            <View key={pt.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.monoText}>{pt.protocol}</Text>
                <StatusBadge
                  status={pt.status}
                  highContrast={highContrastPref}
                  scale={scale}
                />
              </View>
              <Text
                style={{
                  fontWeight: '700',
                  marginTop: 4,
                  fontSize: 15 * scale,
                }}
              >
                {pt.title}
              </Text>
              <Text
                style={[
                  styles.mutedText,
                  { fontSize: 13 * scale, marginBottom: 8 },
                ]}
              >
                {pt.categoryName} · Bairro {pt.neighborhood}
              </Text>
              <PrimaryButton
                label="Ver detalhes"
                variant="secondary"
                onPress={() => openDetail(pt.id)}
                scale={scale}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
