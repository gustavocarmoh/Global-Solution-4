import React from 'react';
import { ScrollView, Share, Switch, Text, TouchableOpacity, View } from 'react-native';
import { TextSizePref } from '@cidade-em-foco/shared';
import { TOKENS } from '../theme/tokens';
import { ChipButton, FieldInput, NoticeBox, PrimaryButton } from '../components/MobileDesignSystem';
import { API_BASE_URL, apiFetch, clearSession, errorMessage, saveSessionUser, SessionUser } from '../lib/api';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function PerfilScreen() {
  const {
    setScreen, user, setUser, textSizePref, setTextSizePref, highContrastPref,
    setHighContrastPref, reduceMotionPref, setReduceMotionPref, emailNotifications,
    setEmailNotifications, setLastOccurrence, setMyOccurrences, setAuthInfo,
    editingProfile, setEditingProfile, profileName, setProfileName, profilePhone,
    setProfilePhone, profileFeedback, setProfileFeedback, profileError,
    setProfileError, profileBusy, setProfileBusy, confirmDeleteAccount,
    setConfirmDeleteAccount, scale, syncPreference, handleLogout,
  } = useApp();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.h2, { fontSize: 20 * scale }]}>
        Perfil e acessibilidade
      </Text>

      {profileFeedback && (
        <NoticeBox variant="info" scale={scale}>
          {profileFeedback}
        </NoticeBox>
      )}
      {profileError && (
        <NoticeBox variant="danger" scale={scale}>
          {profileError}
        </NoticeBox>
      )}

      {/* Dados da conta */}
      <View style={styles.card}>
        <View style={[styles.rowBetween, { marginBottom: 10 }]}>
          <Text style={[styles.h3, { fontSize: 17 * scale }]}>
            Dados da conta
          </Text>
          {user ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setProfileName(user.name || '');
                setProfilePhone(user.phone || '');
                setProfileError(null);
                setEditingProfile((v) => !v);
              }}
              style={styles.smallLinkBtn}
            >
              <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
                {editingProfile ? 'Cancelar' : 'Editar'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setScreen('entrar')}
              style={styles.smallLinkBtn}
            >
              <Text style={{ color: TOKENS.brand, fontWeight: '700' }}>
                Entrar / Criar conta
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {editingProfile ? (
          <View>
            <FieldInput
              label="Nome"
              value={profileName}
              onChangeText={setProfileName}
              scale={scale}
            />
            <FieldInput
              label="Telefone"
              value={profilePhone}
              onChangeText={setProfilePhone}
              scale={scale}
            />
            <PrimaryButton
              label={profileBusy ? 'Salvando...' : 'Salvar'}
              disabled={profileBusy}
              onPress={async () => {
                setProfileFeedback(null);
                setProfileError(null);
                setProfileBusy(true);
                try {
                  const updated = await apiFetch<SessionUser>('/me/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: profileName,
                      phone: profilePhone,
                    }),
                  });
                  const merged = { ...(user as SessionUser), ...updated };
                  setUser(merged);
                  await saveSessionUser(merged);
                  setEditingProfile(false);
                  setProfileFeedback('Dados atualizados com sucesso.');
                } catch (err) {
                  setProfileError(
                    errorMessage(err, 'Não foi possível atualizar seus dados.'),
                  );
                } finally {
                  setProfileBusy(false);
                }
              }}
              scale={scale}
            />
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14 * scale }}>
              Nome:{' '}
              <Text style={{ fontWeight: '700' }}>
                {user ? user.name : 'Visitante (sem conta)'}
              </Text>
            </Text>
            <Text style={{ fontSize: 14 * scale }}>
              E-mail:{' '}
              <Text style={{ fontWeight: '700' }}>
                {user?.email || 'Não informado'}
              </Text>
            </Text>
            <Text style={{ fontSize: 14 * scale }}>
              Telefone:{' '}
              <Text style={{ fontWeight: '700' }}>
                {user?.phone || 'Não informado'}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* Seção Acessibilidade (aplica na hora) */}
      <View style={styles.card}>
        <Text
          style={[
            styles.h3,
            { fontSize: 17 * scale, marginBottom: 10 },
          ]}
        >
          Acessibilidade
        </Text>
        <Text
          style={{
            fontWeight: '700',
            marginBottom: 8,
            fontSize: 14 * scale,
          }}
        >
          Tamanho do texto
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
        >
          <ChipButton
            label="Padrão (100%)"
            active={textSizePref === TextSizePref.DEFAULT}
            onPress={() => {
              setTextSizePref(TextSizePref.DEFAULT);
              syncPreference({ textSizePref: TextSizePref.DEFAULT });
            }}
            scale={scale}
          />
          <ChipButton
            label="Grande (125%)"
            active={textSizePref === TextSizePref.LARGE}
            onPress={() => {
              setTextSizePref(TextSizePref.LARGE);
              syncPreference({ textSizePref: TextSizePref.LARGE });
            }}
            scale={scale}
          />
          <ChipButton
            label="Muito grande (150%)"
            active={textSizePref === TextSizePref.XLARGE}
            onPress={() => {
              setTextSizePref(TextSizePref.XLARGE);
              syncPreference({ textSizePref: TextSizePref.XLARGE });
            }}
            scale={scale}
          />
        </ScrollView>

        <View style={styles.switchRow}>
          <Text style={{ fontWeight: '600', fontSize: 14 * scale }}>
            Alto contraste
          </Text>
          <Switch
            accessibilityLabel="Alto contraste"
            value={highContrastPref}
            onValueChange={(v) => {
              setHighContrastPref(v);
              syncPreference({ highContrastPref: v });
            }}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={{ fontWeight: '600', fontSize: 14 * scale }}>
            Reduzir animações
          </Text>
          <Switch
            accessibilityLabel="Reduzir animações"
            value={reduceMotionPref}
            onValueChange={(v) => {
              setReduceMotionPref(v);
              syncPreference({ reduceMotionPref: v });
            }}
          />
        </View>
      </View>

      {/* Notificações */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={{ fontWeight: '600', fontSize: 14 * scale }}>
            Notificações por e-mail{user ? '' : ' (requer conta)'}
          </Text>
          <Switch
            accessibilityLabel="Notificações por e-mail"
            value={emailNotifications}
            disabled={!user}
            onValueChange={(v) => {
              setEmailNotifications(v);
              syncPreference({ emailNotifications: v });
            }}
          />
        </View>
      </View>

      {/* Privacidade LGPD (ações sobre a conta) */}
      {user && (
        <View style={styles.card}>
          <Text
            style={[
              styles.h3,
              { fontSize: 17 * scale, marginBottom: 10 },
            ]}
          >
            Privacidade (LGPD)
          </Text>
          <View style={{ gap: 10 }}>
            <PrimaryButton
              label="📥 Baixar meus dados"
              variant="secondary"
              onPress={async () => {
                setProfileFeedback(null);
                setProfileError(null);
                try {
                  const data = await apiFetch('/me/export');
                  // Abre a folha de compartilhamento do aparelho com o JSON exportado
                  await Share.share({
                    title: 'Meus dados — Cidade em Foco',
                    message: JSON.stringify(data, null, 2),
                  });
                  setProfileFeedback(
                    'Seus dados pessoais foram exportados conforme a LGPD.',
                  );
                } catch (err) {
                  setProfileError(
                    errorMessage(err, 'Não foi possível exportar os dados.'),
                  );
                }
              }}
              scale={scale}
            />
            {!confirmDeleteAccount ? (
              <PrimaryButton
                label="🗑️ Excluir minha conta"
                variant="ghost"
                onPress={() => setConfirmDeleteAccount(true)}
                scale={scale}
              />
            ) : (
              <View style={{ gap: 8 }}>
                <NoticeBox variant="danger" scale={scale}>
                  Confirmar exclusão da conta e anonimização das solicitações?
                </NoticeBox>
                <PrimaryButton
                  label={profileBusy ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
                  variant="danger"
                  disabled={profileBusy}
                  onPress={async () => {
                    setProfileError(null);
                    setProfileBusy(true);
                    try {
                      await apiFetch('/me', { method: 'DELETE' });
                      await clearSession();
                      setUser(null);
                      setLastOccurrence(null);
                      setMyOccurrences([]);
                      setConfirmDeleteAccount(false);
                      setAuthInfo('Sua conta foi excluída e seus dados foram anonimizados.');
                      setScreen('entrar');
                    } catch (err) {
                      // A conta NÃO foi excluída: mantém a sessão e informa o erro
                      setConfirmDeleteAccount(false);
                      setProfileError(
                        errorMessage(err, 'Não foi possível excluir a conta.'),
                      );
                    } finally {
                      setProfileBusy(false);
                    }
                  }}
                  scale={scale}
                />
                <PrimaryButton
                  label="Cancelar"
                  variant="secondary"
                  onPress={() => setConfirmDeleteAccount(false)}
                  scale={scale}
                />
              </View>
            )}
          </View>
        </View>
      )}

      <Text style={[styles.mutedText, { fontSize: 11 * scale, textAlign: 'center' }]}>
        Servidor: {API_BASE_URL}
      </Text>

      {user && (
        <PrimaryButton
          label="🚪 Sair"
          variant="secondary"
          onPress={handleLogout}
          scale={scale}
        />
      )}
    </ScrollView>
  );
}
