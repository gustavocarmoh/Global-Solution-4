import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { TOKENS } from '../theme/tokens';

export interface MobileMapPin {
  id: string;
  protocol: string;
  title: string;
  categoryName: string;
  neighborhood: string;
  status: string;
  latitude?: number;
  longitude?: number;
}

export interface MobileMapCanvasProps {
  center: { latitude: number; longitude: number };
  pins?: MobileMapPin[];
  /** Total de ocorrências por bairro (vem da API junto com os pontos). */
  clusters?: Array<{ neighborhood: string; count: number; latitude: number; longitude: number }>;
  selectedPinId?: string | null;
  onSelectPin?: (pin: MobileMapPin) => void;
  pickerCoord?: { latitude: number; longitude: number } | null;
  onPickCoord?: (lat: number, lng: number) => void;
  height?: number;
  /** Abertura do mapa em graus (menor = mais zoom). */
  delta?: number;
}

const round6 = (n: number) => Number(n.toFixed(6));

/**
 * Mapa nativo (iOS/Android) com react-native-maps: pins das ocorrências,
 * círculos com o total por bairro e, no registro, marcador arrastável.
 * No Expo Web é usada a variante MobileMapCanvas.web.tsx.
 */
export const MobileMapCanvas: React.FC<MobileMapCanvasProps> = ({
  center,
  pins = [],
  clusters = [],
  selectedPinId,
  onSelectPin,
  pickerCoord,
  onPickCoord,
  height = 280,
  delta = 0.04,
}) => {
  return (
    <View style={[styles.mapBox, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Mapa da cidade com marcadores de ocorrências"
        region={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: delta,
          longitudeDelta: delta,
        }}
        onPress={(e) => {
          if (!onPickCoord) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onPickCoord(round6(latitude), round6(longitude));
        }}
      >
        {clusters.map((c) => (
          <Marker
            key={`cluster-${c.neighborhood}`}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            accessibilityLabel={`${c.count} ocorrências em ${c.neighborhood}`}
          >
            <View style={styles.clusterBubble}>
              <Text style={styles.clusterCount}>{c.count}</Text>
            </View>
          </Marker>
        ))}

        {pins
          .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
          .map((pin) => (
            <Marker
              key={pin.id}
              coordinate={{
                latitude: pin.latitude as number,
                longitude: pin.longitude as number,
              }}
              pinColor={pin.id === selectedPinId ? TOKENS.sun : TOKENS.brand}
              accessibilityLabel={`${pin.categoryName} em ${pin.neighborhood}, protocolo ${pin.protocol}`}
              onPress={(e) => {
                e.stopPropagation();
                onSelectPin?.(pin);
              }}
            />
          ))}

        {pickerCoord && (
          <Marker
            coordinate={pickerCoord}
            pinColor={TOKENS.sun}
            draggable={Boolean(onPickCoord)}
            accessibilityLabel="Local do problema. Arraste para ajustar."
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              onPickCoord?.(round6(latitude), round6(longitude));
            }}
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  mapBox: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.line,
    overflow: 'hidden',
    backgroundColor: '#e4efe9',
  },
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
  clusterCount: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
