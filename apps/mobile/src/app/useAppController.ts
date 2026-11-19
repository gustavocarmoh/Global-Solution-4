import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { TextSizePref } from '@cidade-em-foco/shared';
import { CITY_CENTER, getFontScale, MobileCategory, MobileMapCluster, MobileOccurrence, MobileOccurrenceDetail, nearestNeighborhood, NEIGHBORHOOD_CENTERS } from '../theme/tokens';
import { apiFetch, clearSession, errorMessage, restoreSession, saveSessionUser, SessionUser, setSessionExpiredHandler } from '../lib/api';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

export type ScreenName =
  | 'entrar'
  | 'inicio'
  | 'mapa'
  | 'registrar'
  | 'solicitacoes'
  | 'detalhe'
  | 'perfil';

/** Foto escolhida no aparelho, pronta para o envio multipart. */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Estado e ações compartilhados pelas telas do app do cidadão. */
export function useAppController() {
  // Navegação das 7 telas do cidadão
  const [screen, setScreen] = useState<ScreenName>('inicio');
  const [booting, setBooting] = useState<boolean>(true);
  /** Id (UUID) ou protocolo (CF-AAAA-NNNNNN) da solicitação aberta no detalhe. */
  const [selectedOccurrenceRef, setSelectedOccurrenceRef] = useState<string>('');

  // Conta do Cidadão e Preferências de Acessibilidade (Tela 1 e Tela 7)
  const [user, setUser] = useState<SessionUser | null>(null);

  const [textSizePref, setTextSizePref] = useState<TextSizePref>(
    TextSizePref.DEFAULT,
  );
  const [highContrastPref, setHighContrastPref] = useState<boolean>(false);
  const [reduceMotionPref, setReduceMotionPref] = useState<boolean>(false);
  const [emailNotifications, setEmailNotifications] = useState<boolean>(true);

  const scale = getFontScale(textSizePref);

  // Dados vindos da API
  const [categories, setCategories] = useState<MobileCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [lastOccurrence, setLastOccurrence] = useState<MobileOccurrence | null>(null);
  const [recentOccurrences, setRecentOccurrences] = useState<MobileOccurrence[]>([]);
  const [homeLoading, setHomeLoading] = useState<boolean>(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const [mapPoints, setMapPoints] = useState<MobileOccurrence[]>([]);
  const [mapClusters, setMapClusters] = useState<MobileMapCluster[]>([]);
  const [mapLoading, setMapLoading] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [myOccurrences, setMyOccurrences] = useState<MobileOccurrence[]>([]);
  const [myLoading, setMyLoading] = useState<boolean>(false);
  const [myError, setMyError] = useState<string | null>(null);

  const [detail, setDetail] = useState<MobileOccurrenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Tela 1 — Entrar / Criar conta
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);

  // Tela 3 — Mapa (/mapa)
  const [mapNeighborhood, setMapNeighborhood] = useState<string>('');
  const [mapCategorySlug, setMapCategorySlug] = useState<string>('');
  const [mapStatusFilter, setMapStatusFilter] = useState<string>('');
  const [mapViewAsList, setMapViewAsList] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState(CITY_CENTER);
  const [selectedMapPinId, setSelectedMapPinId] = useState<string>('');

  // Tela 4 — Registrar (/registrar) em 4 passos + confirmação
  const [regStep, setRegStep] = useState<number>(1);
  const [regCategoryId, setRegCategoryId] = useState<string>('');
  const [regDescription, setRegDescription] = useState<string>('');
  const [regReferencePoint, setRegReferencePoint] = useState<string>('');
  const [regPhotos, setRegPhotos] = useState<PickedPhoto[]>([]);
  const [regAddressText, setRegAddressText] = useState<string>('');
  const [regNeighborhood, setRegNeighborhood] = useState<string>('Centro');
  const [regLat, setRegLat] = useState<number>(NEIGHBORHOOD_CENTERS.Centro.latitude);
  const [regLng, setRegLng] = useState<number>(NEIGHBORHOOD_CENTERS.Centro.longitude);
  const [regSearchAddress, setRegSearchAddress] = useState<string>('');
  const [regAnonName, setRegAnonName] = useState<string>('');
  const [regAnonContact, setRegAnonContact] = useState<string>('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState<boolean>(false);
  const [createdOccurrence, setCreatedOccurrence] = useState<{
    id: string;
    protocol: string;
    groupedWithSimilar: boolean;
  } | null>(null);
  const [protocolCopied, setProtocolCopied] = useState<boolean>(false);

  // Tela 5 — Solicitações (/solicitacoes)
  const [reqFilterChip, setReqFilterChip] = useState<
    'all' | 'open' | 'done' | 'rejected'
  >('all');
  const [reqSearchQ, setReqSearchQ] = useState<string>('');
  const [protocolQuery, setProtocolQuery] = useState<string>('');
  const [protocolLookupResult, setProtocolLookupResult] =
    useState<MobileOccurrenceDetail | null>(null);
  const [protocolLookupError, setProtocolLookupError] = useState<string | null>(null);
  const [protocolLookupBusy, setProtocolLookupBusy] = useState<boolean>(false);

  // Tela 6 — Detalhe (/solicitacoes/:id) e Avaliação
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState<boolean>(false);

  // Tela 7 — Perfil (/perfil)
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [profileName, setProfileName] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState<boolean>(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] =
    useState<boolean>(false);

  /** Aplica na interface as preferências salvas na conta. */
  const applyUserPrefs = (u: Partial<SessionUser>) => {
    if (u.textSizePref) setTextSizePref(u.textSizePref as TextSizePref);
    if (typeof u.highContrastPref === 'boolean') setHighContrastPref(u.highContrastPref);
    if (typeof u.reduceMotionPref === 'boolean') setReduceMotionPref(u.reduceMotionPref);
    if (typeof u.emailNotifications === 'boolean') setEmailNotifications(u.emailNotifications);
  };

  const loadCategories = useCallback(async () => {
    setCategoriesError(null);
    try {
      const list = await apiFetch<MobileCategory[]>('/categories');
      setCategories(list);
      setRegCategoryId((current) => current || list[0]?.id || '');
    } catch (err) {
      setCategoriesError(errorMessage(err, 'Não foi possível carregar as categorias.'));
    }
  }, []);

  // Inicialização: restaura a sessão gravada no aparelho e carrega as categorias
  useEffect(() => {
    let active = true;
    setSessionExpiredHandler(() => {
      setUser(null);
      setAuthInfo('Sua sessão expirou. Entre novamente.');
      setScreen('entrar');
    });
    (async () => {
      const restored = await restoreSession();
      if (active && restored) {
        setUser(restored);
        applyUserPrefs(restored);
        // Confere o perfil no servidor (dados podem ter mudado em outro aparelho)
        apiFetch<SessionUser>('/me/profile')
          .then((fresh) => {
            if (!active) return;
            const merged = { ...restored, ...fresh };
            setUser(merged);
            applyUserPrefs(merged);
            saveSessionUser(merged);
          })
          .catch(() => undefined);
      }
      // Sem sessão guardada, o app abre na tela de login (o uso sem conta continua disponível)
      if (active && !restored) setScreen('entrar');
      if (active) setBooting(false);
    })();
    loadCategories();
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tela Início: última solicitação da conta e registros recentes da cidade
  const loadHome = useCallback(async () => {
    setHomeLoading(true);
    setHomeError(null);
    try {
      const [recent, mine] = await Promise.all([
        apiFetch<{ points: MobileOccurrence[] }>('/map/occurrences?status=open&limit=3'),
        user
          ? apiFetch<{ items: MobileOccurrence[] }>('/me/occurrences?pageSize=1')
          : Promise.resolve({ items: [] as MobileOccurrence[] }),
      ]);
      setRecentOccurrences(recent.points);
      setLastOccurrence(mine.items[0] ?? null);
    } catch (err) {
      setHomeError(errorMessage(err, 'Não foi possível carregar os dados.'));
    } finally {
      setHomeLoading(false);
    }
  }, [user?.id]);

  const loadMap = useCallback(async () => {
    setMapLoading(true);
    setMapError(null);
    try {
      const qs: string[] = [];
      if (mapNeighborhood) qs.push(`neighborhood=${encodeURIComponent(mapNeighborhood)}`);
      if (mapCategorySlug) qs.push(`category=${encodeURIComponent(mapCategorySlug)}`);
      if (mapStatusFilter) qs.push(`status=${encodeURIComponent(mapStatusFilter)}`);
      const data = await apiFetch<{ points: MobileOccurrence[]; clusters: MobileMapCluster[] }>(
        `/map/occurrences?${qs.join('&')}`,
      );
      setMapPoints(data.points);
      setMapClusters(data.clusters);
    } catch (err) {
      setMapError(errorMessage(err, 'Não foi possível carregar o mapa.'));
    } finally {
      setMapLoading(false);
    }
  }, [mapNeighborhood, mapCategorySlug, mapStatusFilter]);

  const loadMine = useCallback(async () => {
    if (!user) {
      setMyOccurrences([]);
      return;
    }
    setMyLoading(true);
    setMyError(null);
    try {
      const q = reqSearchQ.trim();
      const data = await apiFetch<{ items: MobileOccurrence[] }>(
        `/me/occurrences?status=${reqFilterChip}&pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      );
      setMyOccurrences(data.items);
    } catch (err) {
      setMyError(errorMessage(err, 'Não foi possível carregar suas solicitações.'));
    } finally {
      setMyLoading(false);
    }
  }, [user?.id, reqFilterChip, reqSearchQ]);

  const loadDetail = useCallback(async () => {
    if (!selectedOccurrenceRef) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const byProtocol = selectedOccurrenceRef.toUpperCase().startsWith('CF-');
      const data = await apiFetch<MobileOccurrenceDetail>(
        byProtocol
          ? `/occurrences/by-protocol/${encodeURIComponent(selectedOccurrenceRef)}`
          : `/occurrences/${selectedOccurrenceRef}`,
      );
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setDetailError(errorMessage(err, 'Solicitação não encontrada.'));
    } finally {
      setDetailLoading(false);
    }
  }, [selectedOccurrenceRef, user?.id]);

  // Cada tela busca os próprios dados ao ser aberta (e quando os filtros mudam)
  useEffect(() => {
    if (booting) return;
    if (screen === 'inicio') loadHome();
  }, [booting, screen, loadHome]);

  useEffect(() => {
    if (booting) return;
    if (screen === 'mapa') loadMap();
  }, [booting, screen, loadMap]);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (booting || screen !== 'solicitacoes') return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(loadMine, 250);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [booting, screen, loadMine]);

  useEffect(() => {
    if (booting) return;
    if (screen === 'detalhe') loadDetail();
  }, [booting, screen, loadDetail]);

  const openDetail = (ref: string) => {
    setDetail(null);
    setRatingError(null);
    setRatingStars(5);
    setRatingComment('');
    setSelectedOccurrenceRef(ref);
    setScreen('detalhe');
  };

  /** Grava a preferência na conta (quando há login); a interface já foi atualizada. */
  const syncPreference = async (patch: Partial<SessionUser>) => {
    if (!user) return;
    setProfileError(null);
    try {
      await apiFetch('/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const merged = { ...user, ...patch };
      setUser(merged);
      saveSessionUser(merged);
    } catch (err) {
      setProfileError(
        `${errorMessage(err, 'Falha ao salvar a preferência.')} A alteração vale apenas neste aparelho por enquanto.`,
      );
    }
  };

  // GPS nativo com expo-location
  const requestNativeGps = async (forRegister = false) => {
    const fail = (msg: string) => (forRegister ? setRegError(msg) : setMapError(msg));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        fail('Permissão de localização negada. Ajuste o local manualmente.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const lat = Number(loc.coords.latitude.toFixed(6));
      const lng = Number(loc.coords.longitude.toFixed(6));
      if (forRegister) {
        setRegError(null);
        setRegLat(lat);
        setRegLng(lng);
        setRegNeighborhood(nearestNeighborhood(lat, lng));
      } else {
        setMapCenter({ latitude: lat, longitude: lng });
      }
    } catch {
      fail('Não foi possível obter sua localização. Ajuste o local manualmente.');
    }
  };

  // Galeria nativa com expo-image-picker
  const handlePickPhoto = async () => {
    if (regPhotos.length >= MAX_PHOTOS) {
      setRegError('Máximo de 5 fotos atingido.');
      return;
    }
    setRegError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset?.uri) return;
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        setRegError('Cada foto pode ter no máximo 5 MB.');
        return;
      }
      const type = asset.mimeType || 'image/jpeg';
      const extension = type.split('/')[1] || 'jpg';
      setRegPhotos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          type,
          name: asset.fileName || `foto-${prev.length + 1}.${extension}`,
        },
      ]);
    } catch {
      setRegError('Não foi possível abrir a galeria de fotos.');
    }
  };

  // Busca de endereço Nominatim no Passo 3
  const handleNominatimLookup = async () => {
    if (!regSearchAddress.trim()) return;
    setRegError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          regSearchAddress,
        )}&limit=1`,
      );
      const data = await res.json();
      if (data?.[0]) {
        const lat = Number(parseFloat(data[0].lat).toFixed(6));
        const lng = Number(parseFloat(data[0].lon).toFixed(6));
        setRegLat(lat);
        setRegLng(lng);
        setRegNeighborhood(nearestNeighborhood(lat, lng));
        setRegAddressText(
          data[0].display_name.split(',').slice(0, 2).join(','),
        );
      } else {
        setRegError('Endereço não encontrado. Digite o endereço manualmente.');
      }
    } catch {
      setRegError(
        'A busca de endereços está indisponível. Digite o endereço manualmente.',
      );
    }
  };

  // Submissão do Registro em 4 Passos: sempre pela API (multipart com as fotos)
  const handleSubmitRegistration = async () => {
    setRegError(null);
    if (!regCategoryId) {
      setRegError('Selecione a categoria do problema.');
      setRegStep(1);
      return;
    }
    setRegBusy(true);
    try {
      const form = new FormData();
      form.append('categoryId', regCategoryId);
      form.append('description', regDescription.trim());
      if (regReferencePoint.trim()) {
        form.append('referencePoint', regReferencePoint.trim());
      }
      form.append('addressText', regAddressText.trim());
      form.append('neighborhood', regNeighborhood);
      form.append('latitude', String(regLat));
      form.append('longitude', String(regLng));
      if (!user && regAnonName.trim()) {
        form.append('requesterName', regAnonName.trim());
      }
      if (!user && regAnonContact.trim()) {
        form.append('requesterContact', regAnonContact.trim());
      }
      for (const photo of regPhotos) {
        if (Platform.OS === 'web') {
          // No navegador o picker devolve uma URL de blob/data
          const blob = await (await fetch(photo.uri)).blob();
          form.append('photos', blob, photo.name);
        } else {
          form.append('photos', {
            uri: photo.uri,
            name: photo.name,
            type: photo.type,
          } as unknown as Blob);
        }
      }

      const created = await apiFetch<{
        id: string;
        protocol: string;
        groupedWithSimilar: boolean;
      }>('/occurrences', { method: 'POST', body: form });

      setCreatedOccurrence(created);
      setProtocolCopied(false);
      setRegDescription('');
      setRegReferencePoint('');
      setRegPhotos([]);
    } catch (err) {
      setRegError(
        `${errorMessage(err, 'Não foi possível enviar a solicitação.')} Nada foi registrado; revise e tente novamente.`,
      );
    } finally {
      setRegBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Mesmo sem resposta do servidor, a sessão local é encerrada
    }
    await clearSession();
    setUser(null);
    setLastOccurrence(null);
    setMyOccurrences([]);
    setEditingProfile(false);
    setScreen('entrar');
  };

  return {
    screen, setScreen, booting, selectedOccurrenceRef, user, setUser, textSizePref,
    setTextSizePref, highContrastPref, setHighContrastPref, reduceMotionPref,
    setReduceMotionPref, emailNotifications, setEmailNotifications, categories,
    categoriesError, lastOccurrence, setLastOccurrence, recentOccurrences, homeLoading,
    homeError, mapPoints, mapClusters, mapLoading, mapError, myOccurrences,
    setMyOccurrences, myLoading, myError, detail, detailLoading, detailError, authMode,
    setAuthMode, authName, setAuthName, authEmail, setAuthEmail, authPhone,
    setAuthPhone, authPassword, setAuthPassword, lgpdConsent, setLgpdConsent,
    authError, setAuthError, authInfo, setAuthInfo, authBusy, setAuthBusy,
    mapNeighborhood, setMapNeighborhood, mapCategorySlug, setMapCategorySlug,
    mapStatusFilter, setMapStatusFilter, mapViewAsList, setMapViewAsList, mapCenter,
    setMapCenter, selectedMapPinId, setSelectedMapPinId, regStep, setRegStep,
    regCategoryId, setRegCategoryId, regDescription, setRegDescription,
    regReferencePoint, setRegReferencePoint, regPhotos, setRegPhotos, regAddressText,
    setRegAddressText, regNeighborhood, setRegNeighborhood, regLat, setRegLat, regLng,
    setRegLng, regSearchAddress, setRegSearchAddress, regAnonName, setRegAnonName,
    regAnonContact, setRegAnonContact, regError, setRegError, regBusy,
    createdOccurrence, setCreatedOccurrence, protocolCopied, setProtocolCopied,
    reqFilterChip, setReqFilterChip, reqSearchQ, setReqSearchQ, protocolQuery,
    setProtocolQuery, protocolLookupResult, setProtocolLookupResult,
    protocolLookupError, setProtocolLookupError, protocolLookupBusy,
    setProtocolLookupBusy, ratingStars, setRatingStars, ratingComment,
    setRatingComment, ratingError, setRatingError, ratingBusy, setRatingBusy,
    editingProfile, setEditingProfile, profileName, setProfileName, profilePhone,
    setProfilePhone, profileFeedback, setProfileFeedback, profileError,
    setProfileError, profileBusy, setProfileBusy, confirmDeleteAccount,
    setConfirmDeleteAccount, scale, applyUserPrefs, loadCategories, loadHome, loadMap,
    loadMine, loadDetail, openDetail, syncPreference, requestNativeGps,
    handlePickPhoto, handleNominatimLookup, handleSubmitRegistration, handleLogout,
  };
}

export type AppController = ReturnType<typeof useAppController>;
