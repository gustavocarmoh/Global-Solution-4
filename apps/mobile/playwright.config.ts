import { defineConfig, devices } from '@playwright/test';

/**
 * Testa o app mobile pela variante Expo Web (mesmo código de telas e de acesso à API
 * do Android/iOS; só o mapa usa um componente alternativo no navegador).
 * A API e o banco precisam estar no ar; o bundle web é gerado e servido aqui.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    ...devices['Pixel 7'],
  },
  webServer: {
    command:
      'npx expo export --platform web --output-dir dist-web && python3 -m http.server 8081 --bind 127.0.0.1 --directory dist-web',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
