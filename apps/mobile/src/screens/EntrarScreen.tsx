import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { EmergencyBanner, FieldInput, NoticeBox, PrimaryButton } from '../components/MobileDesignSystem';
import { apiFetch, errorMessage, saveSession, SessionUser } from '../lib/api';
import { styles } from '../app/styles';
import { useApp } from '../app/AppContext';

export function EntrarScreen() {
  const {
    setScreen, setUser, authMode, setAuthMode, authName, setAuthName, authEmail,
    setAuthEmail, authPhone, setAuthPhone, authPassword, setAuthPassword, lgpdConsent,
    setLgpdConsent, authError, setAuthError, authInfo, setAuthInfo, authBusy,
    setAuthBusy, scale, applyUserPrefs,
  } = useApp();

  const handleAuthSubmit = async () => {
    setAuthError(null);
    setAuthInfo(null);
    if (authMode === 'register') {
      if (authName.trim().length < 3) {
        setAuthError('Informe seu nome completo (mínimo 3 caracteres).');
        return;
      }
      if (!lgpdConsent) {
        setAuthError(
          'Você precisa aceitar o termo de consentimento LGPD para criar uma conta.',
        );
        return;
      }
    }
    if (!authEmail.includes('@') || authPassword.length < 6) {
      setAuthError('Informe um e-mail válido e senha com no mínimo 6 caracteres.');
      return;
    }

    setAuthBusy(true);
    try {
      const data = await apiFetch<{
        user: SessionUser;
        accessToken: string;
        refreshToken: string;
      }>(authMode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(
          authMode === 'login'
            ? { email: authEmail.trim(), password: authPassword }
            : {
                name: authName.trim(),
                email: authEmail.trim(),
                phone: authPhone.trim() || undefined,
                password: authPassword,
                lgpdConsent: true,
              },
        ),
      });
      await saveSession(
        { accessToken: data.accessToken, refreshToken: data.refreshToken },
        data.user,
      );
      setUser(data.user);
      applyUserPrefs(data.user);
      setAuthPassword('');
      setScreen('inicio');
    } catch (err) {
      setAuthError(
        errorMessage(err, 'Não foi possível autenticar. Verifique os dados informados.'),
      );
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <EmergencyBanner scale={scale} />

      {/* Logotipo "Cidade em Foco" com ícone de alvo */}
      <View style={styles.logoHeader}>
        <View style={styles.logoIconBox}>
          <Text style={{ fontSize: 28 }}>🎯</Text>
        </View>
        <Text style={[styles.h1, { fontSize: 24 * scale }]}>
          Cidade em Foco
        </Text>
        <Text style={[styles.mutedText, { fontSize: 14 * scale }]}>
          Plataforma municipal de zeladoria urbana e participação cidadã
        </Text>
      </View>

      {/* Alternância Entrar e Criar conta */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: authMode === 'login' }}
          onPress={() => {
            setAuthMode('login');
            setAuthError(null);
          }}
          style={[
            styles.segmentTab,
            authMode === 'login' && styles.segmentTabActive,
          ]}
        >
          <Text
            style={{
              fontWeight: '700',
              color: authMode === 'login' ? '#ffffff' : TOKENS.ink,
              fontSize: 14 * scale,
            }}
          >
            Entrar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: authMode === 'register' }}
          onPress={() => {
            setAuthMode('register');
            setAuthError(null);
          }}
          style={[
            styles.segmentTab,
            authMode === 'register' && styles.segmentTabActive,
          ]}
        >
          <Text
            style={{
              fontWeight: '700',
              color: authMode === 'register' ? '#ffffff' : TOKENS.ink,
              fontSize: 14 * scale,
            }}
          >
            Criar conta
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {authError && (
          <View style={{ marginBottom: 12 }}>
            <NoticeBox variant="danger" scale={scale}>
              {authError}
            </NoticeBox>
          </View>
        )}
        {authInfo && (
          <View style={{ marginBottom: 12 }}>
            <NoticeBox variant="info" scale={scale}>
              {authInfo}
            </NoticeBox>
          </View>
        )}

        {authMode === 'register' && (
          <FieldInput
            label="Nome *"
            value={authName}
            onChangeText={setAuthName}
            placeholder="Ex.: Mariana Souza"
            scale={scale}
          />
        )}

        <FieldInput
          label="E-mail *"
          value={authEmail}
          onChangeText={setAuthEmail}
          placeholder="seu.email@exemplo.com.br"
          keyboardType="email-address"
          scale={scale}
        />

        {authMode === 'register' && (
          <FieldInput
            label="Telefone (opcional)"
            value={authPhone}
            onChangeText={setAuthPhone}
            placeholder="(11) 98765-4321"
            keyboardType="phone-pad"
            scale={scale}
          />
        )}

        <FieldInput
          label="Senha *"
          value={authPassword}
          onChangeText={setAuthPassword}
          placeholder="Mínimo de 6 caracteres"
          secureTextEntry
          scale={scale}
        />

        {authMode === 'register' && (
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: lgpdConsent }}
            onPress={() => setLgpdConsent((v) => !v)}
            style={styles.consentBox}
          >
            <Text style={{ fontSize: 18 }}>{lgpdConsent ? '☑️' : '⬜'}</Text>
            <Text style={{ flex: 1, fontSize: 13 * scale, color: TOKENS.ink }}>
              Concordo com o tratamento dos meus dados pessoais conforme a
              LGPD para acompanhamento das solicitações. Meus dados nunca
              aparecerão no mapa público.
            </Text>
          </TouchableOpacity>
        )}

        <PrimaryButton
          label={
            authBusy
              ? 'Aguarde...'
              : authMode === 'login'
                ? 'Entrar'
                : 'Criar conta'
          }
          disabled={authBusy}
          onPress={handleAuthSubmit}
          scale={scale}
        />

        <View style={{ marginTop: 10 }}>
          <PrimaryButton
            label="Continuar sem conta"
            variant="secondary"
            onPress={() => setScreen('inicio')}
            scale={scale}
          />
        </View>

        {authMode === 'login' && (
          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              label="Esqueci a senha"
              variant="ghost"
              onPress={async () => {
                setAuthError(null);
                setAuthInfo(null);
                if (!authEmail.includes('@')) {
                  setAuthError(
                    'Informe seu e-mail no campo acima para receber o link de redefinição.',
                  );
                  return;
                }
                try {
                  const res = await apiFetch<{ message: string }>(
                    '/auth/forgot-password',
                    {
                      method: 'POST',
                      body: JSON.stringify({ email: authEmail.trim() }),
                    },
                  );
                  setAuthInfo(res.message);
                } catch (err) {
                  setAuthError(
                    errorMessage(err, 'Não foi possível solicitar a redefinição de senha.'),
                  );
                }
              }}
              scale={scale}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
