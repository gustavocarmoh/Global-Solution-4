import React from 'react';
import { ActivityIndicator, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from './src/theme/tokens';
import { styles } from './src/app/styles';
import { StatusBar } from 'expo-status-bar';
import { AppContext } from './src/app/AppContext';
import { useAppController } from './src/app/useAppController';
import { EntrarScreen } from './src/screens/EntrarScreen';
import { InicioScreen } from './src/screens/InicioScreen';
import { MapaScreen } from './src/screens/MapaScreen';
import { RegistrarScreen } from './src/screens/RegistrarScreen';
import { SolicitacoesScreen } from './src/screens/SolicitacoesScreen';
import { DetalheScreen } from './src/screens/DetalheScreen';
import { PerfilScreen } from './src/screens/PerfilScreen';

/** Casca do app: estado compartilhado, tela ativa e barra de abas. */
export default function App() {
  const app = useAppController();
  const {
    screen, setScreen, booting, highContrastPref, setRegStep, setCreatedOccurrence,
  } = app;

  return (
    <AppContext.Provider value={app}>
      <SafeAreaView
        style={[
          styles.safeArea,
          highContrastPref && { backgroundColor: '#ffffff' },
        ]}
      >
        <StatusBar style="dark" />

        {/* Em tablet ou tela larga o app fica numa coluna centralizada, como em um celular grande */}
        <View style={styles.frame}>
        <View style={{ flex: 1 }}>
          {booting && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={TOKENS.brand} size="large" />
            </View>
          )}
          {!booting && screen === 'entrar' && <EntrarScreen />}
          {!booting && screen === 'inicio' && <InicioScreen />}
          {!booting && screen === 'mapa' && <MapaScreen />}
          {!booting && screen === 'registrar' && <RegistrarScreen />}
          {!booting && screen === 'solicitacoes' && <SolicitacoesScreen />}
          {!booting && screen === 'detalhe' && <DetalheScreen />}
          {!booting && screen === 'perfil' && <PerfilScreen />}
        </View>

        {/* Barra Inferior com 5 Abas: Início, Mapa, Registrar (destaque central), Solicitações, Perfil */}
        {screen !== 'entrar' && (
          <View
            accessibilityRole="tablist"
            style={[
              styles.tabBar,
              highContrastPref && { borderTopColor: '#000000', borderTopWidth: 2 },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === 'inicio' }}
              onPress={() => setScreen('inicio')}
              style={styles.tabItem}
            >
              <Text style={{ fontSize: 18 }}>🏠</Text>
              <Text
                style={[
                  styles.tabLabel,
                  screen === 'inicio' && styles.tabLabelActive,
                ]}
              >
                Início
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === 'mapa' }}
              onPress={() => setScreen('mapa')}
              style={styles.tabItem}
            >
              <Text style={{ fontSize: 18 }}>🗺️</Text>
              <Text
                style={[
                  styles.tabLabel,
                  screen === 'mapa' && styles.tabLabelActive,
                ]}
              >
                Mapa
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === 'registrar' }}
              onPress={() => {
                setCreatedOccurrence(null);
                setRegStep(1);
                setScreen('registrar');
              }}
              style={styles.tabItemCenterHighlight}
            >
              <Text style={{ fontSize: 18, color: '#ffffff' }}>➕</Text>
              <Text style={styles.tabLabelCenter}>Registrar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{
                selected: screen === 'solicitacoes' || screen === 'detalhe',
              }}
              onPress={() => setScreen('solicitacoes')}
              style={styles.tabItem}
            >
              <Text style={{ fontSize: 18 }}>📄</Text>
              <Text
                style={[
                  styles.tabLabel,
                  (screen === 'solicitacoes' || screen === 'detalhe') &&
                    styles.tabLabelActive,
                ]}
              >
                Solicitações
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === 'perfil' }}
              onPress={() => setScreen('perfil')}
              style={styles.tabItem}
            >
              <Text style={{ fontSize: 18 }}>👤</Text>
              <Text
                style={[
                  styles.tabLabel,
                  screen === 'perfil' && styles.tabLabelActive,
                ]}
              >
                Perfil
              </Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </SafeAreaView>
  
    </AppContext.Provider>
  );
}
