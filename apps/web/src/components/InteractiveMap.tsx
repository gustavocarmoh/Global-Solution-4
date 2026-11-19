import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

export interface MapPointItem {
  id: string;
  protocol: string;
  title: string;
  categoryName: string;
  categorySlug?: string;
  categoryIcon?: string;
  status: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  similarCount?: number;
}

export interface MapClusterItem {
  neighborhood: string;
  count: number;
  latitude: number;
  longitude: number;
}

function createPinIcon(selected: boolean) {
  const bg = selected ? '#f2b632' : '#0b5d4b';
  const border = selected ? '#1b2420' : '#ffffff';
  const size = selected ? 32 : 26;

  return L.divIcon({
    className: 'cf-custom-pin',
    html: `<div style="
      width:${size}px;
      height:${size}px;
      border-radius:50% 50% 50% 0;
      background:${bg};
      border:3px solid ${border};
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.28);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function createClusterIcon(count: number) {
  return L.divIcon({
    className: 'cf-custom-cluster',
    html: `<div style="
      width:42px;
      height:42px;
      border-radius:50%;
      background:#0b5d4b;
      color:#ffffff;
      border:3px solid #dcefe9;
      display:flex;
      align-items:center;
      justify-content:center;
      font-family:'IBM Plex Mono', monospace;
      font-size:13px;
      font-weight:700;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
    ">${count}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

const MapCenterUpdater: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  // Mudar de bairro ou de posição reenquadra o mapa (centro e zoom), como o chamador espera
  // Dependências primitivas: re-renderizar a página com o mesmo ponto não mexe no mapa do usuário
  const [lat, lng] = center;
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
};

const MapClickHandler: React.FC<{
  onPickLocation?: (lat: number, lng: number) => void;
}> = ({ onPickLocation }) => {
  useMapEvents({
    click(e) {
      if (onPickLocation) {
        onPickLocation(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6)),
        );
      }
    },
  });
  return null;
};

/** Enquadra o mapa em todos os pontos exibidos sempre que o conjunto de pontos muda (ex.: filtros). */
const FitToPoints: React.FC<{ points: MapPointItem[]; maxZoom: number }> = ({ points, maxZoom }) => {
  const map = useMap();
  const key = points.map((p) => p.id).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    const latLngs = points.map((p) => L.latLng(p.latitude, p.longitude));
    const bounds = L.latLngBounds(latLngs);
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(latLngs[0], Math.min(16, maxZoom));
    } else {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxZoom, map]);
  return null;
};

/** Leva o mapa até um ponto escolhido fora dele (ex.: item da lista). */
export interface MapFocus {
  position: [number, number];
}

const FocusPoint: React.FC<{ focus?: MapFocus | null }> = ({ focus }) => {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus.position, Math.max(map.getZoom(), 15));
  }, [focus, map]);
  return null;
};

/**
 * Totais por bairro. Só aparecem com o mapa afastado: aproximando, somem para não cobrir os
 * marcadores das ocorrências. Clicar em um total aproxima da região dele.
 */
/** A partir deste zoom as bolhas de total somem e ficam só os marcadores. */
const CLUSTER_MAX_ZOOM = 12;

const ClusterLayer: React.FC<{ clusters: MapClusterItem[]; points: MapPointItem[] }> = ({
  clusters,
  points,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  // Aproximado o bastante para ver os chamados, as bolhas saem de cima dos marcadores
  if (zoom >= CLUSTER_MAX_ZOOM) return null;
  // Mapa filtrado em um único bairro: a bolha dele só cobriria os marcadores
  if (points.length > 0 && new Set(points.map((p) => p.neighborhood)).size === 1) return null;

  const zoomTo = (c: MapClusterItem) => {
    const inside = points.filter((p) => p.neighborhood === c.neighborhood);
    if (inside.length > 0) {
      const bounds = L.latLngBounds(inside.map((p) => L.latLng(p.latitude, p.longitude)));
      // Aproxima o bastante para a bolha sair de cima dos marcadores, mesmo em mapas pequenos
      const fit = map.getBoundsZoom(bounds, false, L.point(96, 96));
      map.setView(bounds.getCenter(), Math.min(16, Math.max(CLUSTER_MAX_ZOOM, fit)));
    } else {
      map.setView([c.latitude, c.longitude], 14);
    }
  };

  return (
    <>
      {clusters.map((cluster) => (
        <Marker
          key={`cluster-${cluster.neighborhood}`}
          position={[cluster.latitude, cluster.longitude]}
          icon={createClusterIcon(cluster.count)}
          // As bolhas de total ficam acima dos marcadores para poderem ser clicadas
          zIndexOffset={2000}
          title={`${cluster.count} ocorrências em ${cluster.neighborhood}. Clique para aproximar.`}
          eventHandlers={{ click: () => zoomTo(cluster) }}
        />
      ))}
    </>
  );
};

interface InteractiveMapProps {
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  points?: MapPointItem[];
  clusters?: MapClusterItem[];
  selectedPointId?: string | null;
  onSelectPoint?: (point: MapPointItem) => void;
  pickerPosition?: [number, number] | null;
  onPickLocation?: (lat: number, lng: number) => void;
  /** Enquadra todos os pontos ao carregar e quando o conjunto muda (em vez de usar center/zoom). */
  fitToPoints?: boolean;
  /** Zoom máximo ao enquadrar (visão geral: baixo, para as bolhas de total aparecerem). */
  fitMaxZoom?: number;
  /** Leva o mapa a um ponto escolhido fora dele. */
  focus?: MapFocus | null;
  ariaLabel?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  center = [-23.5505, -46.6333],
  zoom = 13,
  height = 360,
  points = [],
  clusters = [],
  selectedPointId = null,
  onSelectPoint,
  pickerPosition = null,
  onPickLocation,
  fitToPoints = false,
  fitMaxZoom = 16,
  focus = null,
  ariaLabel = 'Mapa interativo de solicitações urbanas',
}) => {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      style={{
        width: '100%',
        height,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--line)',
        position: 'relative',
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fitToPoints ? <FitToPoints points={points} maxZoom={fitMaxZoom} /> : <MapCenterUpdater center={center} zoom={zoom} />}
        <FocusPoint focus={focus} />
        <MapClickHandler onPickLocation={onPickLocation} />

        <ClusterLayer clusters={clusters} points={points} />

        {points.map((pt) => (
          <Marker
            key={pt.id}
            position={[pt.latitude, pt.longitude]}
            icon={createPinIcon(pt.id === selectedPointId)}
            // O marcador selecionado fica por cima dos que estiverem sobrepostos
            zIndexOffset={pt.id === selectedPointId ? 1000 : 0}
            title={`${pt.protocol} — ${pt.categoryName}`}
            eventHandlers={{
              click: () => onSelectPoint?.(pt),
            }}
          />
        ))}

        {pickerPosition && (
          <Marker
            position={pickerPosition}
            icon={createPinIcon(true)}
          />
        )}
      </MapContainer>
    </div>
  );
};
