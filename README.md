# Cidade em Foco — Plataforma Municipal de Zeladoria Urbana e Participação Cidadã

Plataforma integrada (API + web + app mobile) orientada pela **Lei nº 13.460/2017** (Direitos do Usuário de Serviços Públicos), pela **LGPD (Lei nº 13.709/2018)**, pelas diretrizes **WCAG 2.1 AA** e pelos **ODS 9, 10, 11 e 16**.

> **Aviso importante**: esta plataforma não é canal de emergência. Em emergência, ligue **190**, **192** ou **193**. A plataforma não executa manutenção física; ela organiza a comunicação, a triagem, o encaminhamento e o acompanhamento por protocolo.

Os três clientes (web do cidadão, painel administrativo e app mobile) consomem a **mesma API**. Nenhuma tela usa dados embutidos: se a API estiver fora do ar, as telas mostram o erro e um botão “Tentar novamente”.

---

## 1. Estrutura

| Pasta | Conteúdo |
| :--- | :--- |
| `packages/shared` | Enums, rótulos e esquemas Zod usados por API, web e mobile |
| `apps/api` | API REST NestJS + PostgreSQL/PostGIS (SQL puro via `pg`) |
| `apps/web` | React + Vite: painel de **atendimento/administração** (com login) e páginas públicas sem login (transparência, mapa, consulta por protocolo, registro sem conta) |
| `apps/mobile` | Expo / React Native: app do **cidadão** (cadastro, login, solicitações, perfil) |
| `docs/` | Decisões de arquitetura e referência da API |

## 2. Pré-requisitos

- **Node.js** `>= 20` e **npm** `>= 10`
- **Docker** e **Docker Compose** (PostgreSQL 16 + PostGIS, MinIO e Mailpit)

## 3. Como subir

### Opção A — tudo no Docker
```bash
cp .env.example .env
docker compose up --build
```
A API aplica as migrations, popula o banco se ele estiver vazio e só então o web sobe.

### Opção B — infraestrutura no Docker, API e clientes locais (desenvolvimento)
```bash
cp .env.example .env
npm install
npm run infra:up            # postgres, minio e mailpit
npm run build --workspace=@cidade-em-foco/shared
npm run db:migrate
npm run db:seed             # dados de demonstração (inclui os usuários)
npm run db:seed:users       # só os usuários, um de cada tipo (pode rodar várias vezes)

npm run dev:api             # http://localhost:3000/api/v1
npm run dev:web             # http://localhost:5173
npm run dev:mobile          # Expo (Android, iOS ou "w" para web)
```

### App mobile no celular
O app descobre a API pelo mesmo endereço da máquina que roda o Expo (porta 3000), então basta o celular estar na mesma rede. Para apontar para outro servidor, defina `EXPO_PUBLIC_API_URL` (ex.: `http://192.168.0.10:3000/api/v1`). O endereço em uso aparece no rodapé da tela **Perfil**.

## 4. Endereços

| Serviço | URL |
| :--- | :--- |
| Páginas públicas do web | `http://localhost:5173/` (`/mapa`, `/registrar`, `/solicitacoes`, `/solicitacoes/:protocolo`, `/transparencia`, `/dados-abertos`, `/redefinir-senha`); sem login |
| Transparência pública | `http://localhost:5173/transparencia` (sem login, dados agregados) |
| Painel administrativo | `http://localhost:5173/admin/entrar` (rotas `/admin/*` exigem sessão de atendimento: dashboard, solicitações, prazos, mapa, avaliações, relatórios, departamentos e minha conta; **usuários e auditoria só o Administrador**) |
| API REST v1 | `http://localhost:3000/api/v1` · saúde em `/health` |
| Swagger / OpenAPI | `http://localhost:3000/api/docs` |
| Mailpit (e-mails de dev) | `http://localhost:8025` |
| MinIO Console | `http://localhost:9001` (`minioadmin` / `minioadmin123`) |

## 5. Contas do seed (senha `Senha@123`, ou `SEED_USERS_PASSWORD`)

`npm run db:seed:users` cria (ou restaura) **um usuário de cada tipo**, sem mexer nas ocorrências, e é seguro repetir:

| Tipo | E-mail |
| :--- | :--- |
| Administrador | `admin@cidadeemfoco.gov.br` |
| Gestor | `gestor@cidadeemfoco.gov.br` |
| Triagem | `triagem@cidadeemfoco.gov.br` |
| Departamento (Obras) | `obras@cidadeemfoco.gov.br` |
| Cidadão | `mariana.souza@exemplo.com.br` |

Em produção (`NODE_ENV=production`) o comando exige `SEED_USERS_PASSWORD`. O seed completo (`db:seed`) usa os mesmos usuários e acrescenta outros departamentos e cidadãos para a demonstração:

O seed cria **1.284 ocorrências** de maio a outubro de 2026 nos 4 bairros: 212 pendentes, 120 em andamento, 912 concluídas e 40 não procedentes, com 24 grupos de duplicidade (168 relatos) e 554 avaliações. Os painéis exibem exatamente o que está no banco, então esses números mudam conforme você usa o sistema.

| Papel | E-mail |
| :--- | :--- |
| Administrador | `admin@cidadeemfoco.gov.br` |
| Gestor | `gestor@cidadeemfoco.gov.br` |
| Atendimento e triagem | `triagem@cidadeemfoco.gov.br` |
| Departamento — Obras | `obras@cidadeemfoco.gov.br` |
| Departamento — Iluminação | `iluminacao@cidadeemfoco.gov.br` |
| Departamento — Serviços Urbanos | `servicos@cidadeemfoco.gov.br` |
| Departamento — Meio Ambiente | `meioambiente@cidadeemfoco.gov.br` |
| Cidadã | `mariana.souza@exemplo.com.br` |
| Cidadão | `carlos.santos@exemplo.com.br` |
| Cidadã | `ana.ferreira@exemplo.com.br` |

Nome, telefone, departamento e permissões de cada conta estão em [docs/USUARIOS-SEED.md](docs/USUARIOS-SEED.md).

Protocolo de exemplo para consulta sem login: `CF-2026-004812`.

**Sessão**: o token de acesso dura 15 minutos e é renovado automaticamente pelo refresh token, mas a sessão tem **duração absoluta de 24 horas** (`SESSION_MAX_HOURS`): passado esse tempo, web e app pedem novo login com aviso de sessão expirada. “Sair” encerra a sessão também no servidor.

**Quem entra onde**: no web só entram contas de atendimento (triagem, departamento, gestor e administrador), pelo login institucional. O cidadão se cadastra e entra **pelo aplicativo mobile** (tela “Criar conta”); contas de atendimento não entram no aplicativo. Somente o Administrador cria contas de atendimento (painel → Usuários). O login institucional pede só e-mail e senha: o perfil (triagem, departamento, gestor ou administrador) é reconhecido automaticamente pela conta. “Esqueci a senha” envia um link real por e-mail (veja no Mailpit).

## 6. Testes

```bash
npm run lint                 # tsc --noEmit nos 4 pacotes
npm test                     # unitários da API + acessibilidade estrutural das 15 telas web
npm run test:e2e             # API contra PostgreSQL/PostGIS real
npm run test:e2e:web         # navegador (Playwright): web contra a API real
npm run test:e2e:mobile      # navegador (Playwright): app mobile (Expo Web) contra a API real
```

| Suíte | O que precisa estar no ar |
| :--- | :--- |
| `npm test` | nada |
| `npm run test:e2e` | PostgreSQL (`npm run infra:up`). A suíte cria e apaga o banco `cidade_em_foco_e2e`; sem banco, ela falha com mensagem clara |
| `test:e2e:web` e `test:e2e:mobile` | stack completa (Opção A ou B) com o seed carregado. Na primeira vez: `npx playwright install chromium` |

Observações:
- Os testes de navegador criam registros reais no banco de desenvolvimento.
- `test:e2e:web` inclui `e2e/responsive.spec.ts`: abre todas as páginas em 9 tamanhos de tela (celulares, tablet, notebook, Full HD, 2K, 4K e ultrawide), confere que o menu lateral não se move ao trocar de página, que o texto acompanha o monitor e que o clique no mapa cai no ponto certo e falha se a página rolar para os lados, se houver conteúdo cortado, se o conteúdo se esticar demais ou se o menu do painel não se adaptar. `test:e2e:mobile` faz o equivalente para o app (5 tamanhos).
- Login e cadastro têm limite de 10 tentativas por minuto por IP. Para rodar as suítes de navegador, defina `RATE_LIMIT_DISABLED=true` no `.env` e recrie a API (`docker compose up -d api`); remova depois. Com o Docker Desktop no Windows e o shell no WSL, variáveis só chegam ao compose pelo `.env`. Ignorado em produção.
- A auditoria de acessibilidade roda em JSDOM e **não avalia contraste de cor**; isso deve ser conferido em navegador real (Lighthouse ou axe DevTools).
- O app mobile é testado pela variante Expo Web, que compartilha telas e acesso à API com Android/iOS. O mapa nativo (`react-native-maps`) e o seletor de fotos do aparelho só podem ser conferidos em um dispositivo ou emulador. `npm run export:android --workspace=@cidade-em-foco/mobile` valida que o bundle nativo compila.

## 7. Documentação complementar

- [Decisões de arquitetura e produto](docs/DECISOES.md)
- [Referência da API](docs/API.md)
- [Usuários do seed e permissões por perfil](docs/USUARIOS-SEED.md)
