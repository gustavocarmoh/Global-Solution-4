import {
  OccurrencePriority,
  OccurrenceStatus,
  TextSizePref,
} from '@cidade-em-foco/shared';

export const TOKENS = {
  surface100: '#f7f6f2',
  surface200: '#ffffff',
  surface300: '#ece9e1',
  ink: '#1b2420',
  inkMuted: '#4a554f',
  line: '#d9d4c7',
  lineStrong: '#7a8179',
  brand: '#0b5d4b',
  brandSoft: '#dcefe9',
  sun: '#f2b632',

  status: {
    [OccurrenceStatus.RECEIVED]: {
      fg: '#4a554f',
      bg: '#ece9e1',
      icon: '📥',
      label: 'Recebida',
    },
    [OccurrenceStatus.IN_REVIEW]: {
      fg: '#0b5d4b',
      bg: '#dcefe9',
      icon: '🔍',
      label: 'Em análise',
    },
    [OccurrenceStatus.FORWARDED]: {
      fg: '#0b5d4b',
      bg: '#dcefe9',
      icon: '➡️',
      label: 'Encaminhada',
    },
    [OccurrenceStatus.SCHEDULED]: {
      fg: '#8a5200',
      bg: '#fbeccf',
      icon: '📅',
      label: 'Programada',
    },
    [OccurrenceStatus.IN_PROGRESS]: {
      fg: '#8a5200',
      bg: '#fbeccf',
      icon: '⚙️',
      label: 'Em andamento',
    },
    [OccurrenceStatus.DONE]: {
      fg: '#1f5fa8',
      bg: '#e3edf8',
      icon: '☑️',
      label: 'Concluída',
    },
    [OccurrenceStatus.REJECTED]: {
      fg: '#b02a14',
      bg: '#fbe3dd',
      icon: '✖️',
      label: 'Não procedente',
    },
  },
};

export function getFontScale(pref: TextSizePref): number {
  if (pref === TextSizePref.LARGE) return 1.25;
  if (pref === TextSizePref.XLARGE) return 1.5;
  return 1;
}

/** Categoria como devolvida por GET /categories. */
export interface MobileCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  departmentName: string;
}

const CATEGORY_EMOJI: Array<[string, string]> = [
  ['road', '🛣️'],
  ['paviment', '🛣️'],
  ['light', '💡'],
  ['ilumin', '💡'],
  ['trash', '🗑️'],
  ['limpez', '🗑️'],
  ['wheel', '♿'],
  ['acessib', '♿'],
  ['sign', '🪧'],
  ['sinaliz', '🪧'],
  ['tree', '🌳'],
  ['verde', '🌳'],
  ['drop', '💧'],
  ['drenag', '💧'],
];

/** Emoji da categoria a partir do ícone/slug cadastrado no servidor. */
export function categoryEmoji(cat?: { icon?: string; slug?: string } | null): string {
  const key = `${cat?.icon || ''} ${cat?.slug || ''}`.toLowerCase();
  return CATEGORY_EMOJI.find(([k]) => key.includes(k))?.[1] ?? '📌';
}

/** Item de lista/mapa (GET /me/occurrences e GET /map/occurrences). */
export interface MobileOccurrence {
  id: string;
  protocol: string;
  title: string;
  categoryName: string;
  categorySlug?: string;
  categoryIcon?: string;
  neighborhood: string;
  addressText?: string;
  status: OccurrenceStatus;
  latitude?: number;
  longitude?: number;
  createdAt: string;
}

/** Detalhe público (GET /occurrences/:id e /occurrences/by-protocol/:protocolo). */
export interface MobileOccurrenceDetail extends MobileOccurrence {
  description: string;
  referencePoint?: string | null;
  addressText: string;
  latitude: number;
  longitude: number;
  priority: OccurrencePriority;
  departmentName: string;
  similarCount: number;
  isMine: boolean;
  canRate: boolean;
  photos: Array<{ id: string; url: string; thumbUrl: string }>;
  rating: { stars: number; comment?: string | null } | null;
  history: Array<{
    id: string;
    toStatus: OccurrenceStatus;
    justification?: string | null;
    actorName?: string | null;
    createdAt: string;
  }>;
}

export interface MobileMapCluster {
  neighborhood: string;
  count: number;
  latitude: number;
  longitude: number;
}

/** Centro aproximado de cada bairro, usado para posicionar o mapa. */
export const NEIGHBORHOOD_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  Centro: { latitude: -23.5505, longitude: -46.6333 },
  'Zona Norte': { latitude: -23.5015, longitude: -46.625 },
  'Vila Nova': { latitude: -23.588, longitude: -46.672 },
  'Jardim das Flores': { latitude: -23.564, longitude: -46.655 },
};
export const CITY_CENTER = { latitude: -23.5505, longitude: -46.645 };

export function nearestNeighborhood(latitude: number, longitude: number): string {
  let best = 'Centro';
  let bestDist = Infinity;
  for (const [name, c] of Object.entries(NEIGHBORHOOD_CENTERS)) {
    const dist = (latitude - c.latitude) ** 2 + (longitude - c.longitude) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}
