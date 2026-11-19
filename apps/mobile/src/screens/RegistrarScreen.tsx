import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { NEIGHBORHOODS } from '@cidade-em-foco/shared';
import { categoryEmoji, nearestNeighborhood, NEIGHBORHOOD_CENTERS, TOKENS } from '../theme/tokens';
import { ChipButton, EmergencyBanner, FieldInput, NoticeBox, PrimaryButton, StepperBar } from '../components/MobileDesignSystem';
import { MobileMapCanvas } from '../components/MobileMapCanvas';
import { LoadState } from '../components/LoadState';
import { styles } from '../app/styles';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../app/AppContext';

export function RegistrarScreen() {
  const {
    setScreen, user, categories, categoriesError, regStep, setRegStep, regCategoryId,
    setRegCategoryId, regDescription, setRegDescription, regReferencePoint,
    setRegReferencePoint, regPhotos, setRegPhotos, regAddressText, setRegAddressText,
    regNeighborhood, setRegNeighborhood, regLat, setRegLat, regLng, setRegLng,
    regSearchAddress, setRegSearchAddress, regAnonName, setRegAnonName, regAnonContact,
    setRegAnonContact, regError, setRegError, regBusy, createdOccurrence,
    setCreatedOccurrence, protocolCopied, setProtocolCopied, scale, loadCategories,
    openDetail, requestNativeGps, handlePickPhoto, handleNominatimLookup,
    handleSubmitRegistration,
  } = useApp();

  if (createdOccurrence) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <EmergencyBanner scale={scale} />
        <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
          <Text style={{ fontSize: 44 }}>✅</Text>
          <Text
            style={[
              styles.h1,
              { fontSize: 22 * scale, marginTop: 8, textAlign: 'center' },
            ]}
          >
            Solicitação registrada
          </Text>
          <Text
            style={[
              styles.mutedText,
              {
                textAlign: 'center',
                marginVertical: 8,
                fontSize: 14 * scale,
              },
            ]}
          >
            {user || regAnonContact.includes('@')
              ? 'Você será avisado a cada mudança de estado. '
              : ''}
            Guarde o protocolo para acompanhar o andamento.
          </Text>

          <View style={styles.protocolDisplayBox}>
            <Text
              selectable
              accessibilityLabel={`Protocolo ${createdOccurrence.protocol}`}
              style={[styles.monoBig, { fontSize: 22 * scale }]}
            >
              {createdOccurrence.protocol}
            </Text>
          </View>

          {createdOccurrence.groupedWithSimilar && (
            <View style={{ width: '100%', marginTop: 10 }}>
              <NoticeBox variant="info" scale={scale}>
                Outros relatos semelhantes na mesma área foram associados: você
                mantém seu protocolo e recebe as mesmas atualizações.
              </NoticeBox>
            </View>
          )}

          <View style={{ width: '100%', gap: 10, marginTop: 12 }}>
            <PrimaryButton
              label={
                protocolCopied ? '✓ Protocolo copiado!' : '📋 Copiar protocolo'
              }
              variant="secondary"
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(createdOccurrence.protocol);
                  setProtocolCopied(true);
                } catch {
                  setProtocolCopied(false);
                }
              }}
              scale={scale}
            />
            <PrimaryButton
              label="Acompanhar"
              onPress={() => openDetail(createdOccurrence.protocol)}
              scale={scale}
            />
            <PrimaryButton
              label="Registrar outro"
              variant="ghost"
              onPress={() => {
                setCreatedOccurrence(null);
                setRegStep(1);
                setRegDescription('');
                setRegReferencePoint('');
                setRegPhotos([]);
                setProtocolCopied(false);
              }}
              scale={scale}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  const selectedCat = categories.find((c) => c.id === regCategoryId);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <EmergencyBanner scale={scale} />

      <View style={styles.rowBetween}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() =>
            regStep > 1 ? setRegStep(regStep - 1) : setScreen('inicio')
          }
          style={styles.smallOutlineBtn}
        >
          <Text style={{ fontWeight: '700', color: TOKENS.ink }}>
            ← Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[styles.h2, { fontSize: 19 * scale }]}>
          Registrar problema
        </Text>
      </View>

      <StepperBar
        currentStep={regStep}
        steps={['Categoria', 'Descrição', 'Localização', 'Revisão']}
        scale={scale}
      />

      {regError && (
        <NoticeBox variant="danger" scale={scale}>
          {regError}
        </NoticeBox>
      )}

      {/* PASSO 1: CATEGORIA */}
      {regStep === 1 && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 12 },
            ]}
          >
            1. Escolha a categoria
          </Text>
          {categories.length === 0 &&
            (
<LoadState loading={!categoriesError} error={categoriesError} onRetry={loadCategories} scale={scale} />
)}
          <View style={styles.categoriesGrid}>
            {categories.map((cat) => {
              const isSelected = cat.id === regCategoryId;
              return (
                <TouchableOpacity
                  key={cat.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => setRegCategoryId(cat.id)}
                  style={[
                    styles.categoryCard,
                    isSelected && {
                      borderColor: TOKENS.brand,
                      borderWidth: 2,
                      backgroundColor: TOKENS.brandSoft,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>{categoryEmoji(cat)}</Text>
                  <Text
                    style={{
                      fontWeight: '700',
                      color: TOKENS.ink,
                      marginTop: 4,
                      fontSize: 13 * scale,
                    }}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ marginTop: 16 }}>
            <PrimaryButton
              label="Continuar"
              disabled={!regCategoryId}
              onPress={() => setRegStep(2)}
              scale={scale}
            />
          </View>
        </View>
      )}

      {/* PASSO 2: DESCRIÇÃO E FOTOS */}
      {regStep === 2 && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 12 },
            ]}
          >
            2. Descrição e fotos
          </Text>
          <FieldInput
            label="Descrição do problema *"
            hint={`Mínimo de 10 caracteres (${regDescription.length}/2000)`}
            value={regDescription}
            onChangeText={setRegDescription}
            placeholder="Descreva o problema observado na via..."
            multiline
            scale={scale}
          />

          <FieldInput
            label="Ponto de referência (opcional)"
            value={regReferencePoint}
            onChangeText={setRegReferencePoint}
            placeholder="Ex.: Próximo ao ponto de ônibus ou escola"
            scale={scale}
          />

          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontWeight: '700',
                marginBottom: 6,
                fontSize: 14 * scale,
              }}
            >
              Fotos ({regPhotos.length}/5 — opcional)
            </Text>
            <PrimaryButton
              label="📷 Adicionar foto da galeria"
              variant="secondary"
              onPress={handlePickPhoto}
              scale={scale}
            />
            {regPhotos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {regPhotos.map((photo, idx) => (
                  <TouchableOpacity
                    key={photo.uri + idx}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover foto ${idx + 1}`}
                    onPress={() =>
                      setRegPhotos((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                    style={styles.photoChip}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      accessibilityIgnoresInvertColors
                      style={{ width: 44, height: 44, borderRadius: 6 }}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '600' }}>
                      Foto #{idx + 1} ✕
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <PrimaryButton
            label="Continuar para localização"
            onPress={() => {
              if (regDescription.trim().length < 10) {
                setRegError(
                  'A descrição deve ter no mínimo 10 caracteres.',
                );
                return;
              }
              setRegError(null);
              setRegStep(3);
            }}
            scale={scale}
          />
        </View>
      )}

      {/* PASSO 3: LOCALIZAÇÃO */}
      {regStep === 3 && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 12 },
            ]}
          >
            3. Localização
          </Text>

          <PrimaryButton
            label="📍 Usar minha localização (GPS)"
            variant="secondary"
            onPress={() => requestNativeGps(true)}
            scale={scale}
          />

          <View style={{ marginTop: 12 }}>
            <FieldInput
              label="Buscar endereço (Nominatim)"
              value={regSearchAddress}
              onChangeText={setRegSearchAddress}
              placeholder="Digite rua ou praça..."
              scale={scale}
            />
            <PrimaryButton
              label="🔍 Buscar endereço"
              variant="ghost"
              onPress={handleNominatimLookup}
              scale={scale}
            />
          </View>

          <View style={{ marginVertical: 12 }}>
            <MobileMapCanvas
              center={{ latitude: regLat, longitude: regLng }}
              pickerCoord={{ latitude: regLat, longitude: regLng }}
              delta={0.01}
              onPickCoord={(lat, lng) => {
                setRegLat(lat);
                setRegLng(lng);
                setRegNeighborhood(nearestNeighborhood(lat, lng));
              }}
              height={200}
            />
          </View>

          <FieldInput
            label="Endereço ou altura aproximada *"
            value={regAddressText}
            onChangeText={setRegAddressText}
            placeholder="Ex.: Rua Quinze de Novembro, 412"
            scale={scale}
          />

          <Text
            style={{
              fontWeight: '700',
              marginBottom: 6,
              fontSize: 14 * scale,
            }}
          >
            Bairro *
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            {NEIGHBORHOODS.map((nb) => (
              <ChipButton
                key={nb}
                label={nb}
                active={regNeighborhood === nb}
                onPress={() => {
                  // Trocar o bairro manualmente reposiciona o marcador no centro dele
                  if (nearestNeighborhood(regLat, regLng) !== nb) {
                    setRegLat(NEIGHBORHOOD_CENTERS[nb].latitude);
                    setRegLng(NEIGHBORHOOD_CENTERS[nb].longitude);
                  }
                  setRegNeighborhood(nb);
                }}
                scale={scale}
              />
            ))}
          </ScrollView>

          <PrimaryButton
            label="Revisar solicitação"
            onPress={() => {
              if (regAddressText.trim().length < 5) {
                setRegError('Informe o endereço da solicitação (mínimo de 5 caracteres).');
                return;
              }
              setRegError(null);
              setRegStep(4);
            }}
            scale={scale}
          />
        </View>
      )}

      {/* PASSO 4: REVISÃO */}
      {regStep === 4 && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 12 },
            ]}
          >
            4. Revisão
          </Text>

          <View style={styles.reviewBlock}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mutedText}>Categoria</Text>
              <Text style={{ fontWeight: '700', fontSize: 15 * scale }}>
                {categoryEmoji(selectedCat)} {selectedCat?.name ?? 'Selecione uma categoria'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setRegStep(1)}
              style={styles.smallLinkBtn}
            >
              <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
                Editar
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reviewBlock}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mutedText}>
                Descrição ({regPhotos.length} foto(s))
              </Text>
              <Text style={{ fontSize: 14 * scale }}>{regDescription}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setRegStep(2)}
              style={styles.smallLinkBtn}
            >
              <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
                Editar
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reviewBlock}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mutedText}>Localização</Text>
              <Text style={{ fontWeight: '600', fontSize: 14 * scale }}>
                {regAddressText} — {regNeighborhood}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setRegStep(3)}
              style={styles.smallLinkBtn}
            >
              <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
                Editar
              </Text>
            </TouchableOpacity>
          </View>

          {!user && (
            <View style={{ marginVertical: 10 }}>
              <Text
                style={{
                  fontWeight: '700',
                  marginBottom: 6,
                  fontSize: 14 * scale,
                }}
              >
                Dados opcionais para receber avisos (modo sem conta)
              </Text>
              <FieldInput
                label="Seu nome (opcional)"
                value={regAnonName}
                onChangeText={setRegAnonName}
                placeholder="Opcional"
                scale={scale}
              />
              <FieldInput
                label="E-mail ou telefone (opcional, protegido pela LGPD)"
                value={regAnonContact}
                onChangeText={setRegAnonContact}
                placeholder="seu.email@exemplo.com.br"
                scale={scale}
              />
            </View>
          )}

          <PrimaryButton
            label={regBusy ? 'Enviando...' : 'Enviar solicitação'}
            disabled={regBusy}
            onPress={handleSubmitRegistration}
            scale={scale}
          />
        </View>
      )}
    </ScrollView>
  );
}
