import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { BASE_USERS, ensureDepartment, ensureUser, seedPassword } from './seed-users';
import {
  OCCURRENCE_STATUS_LABELS,
  OccurrencePriority,
  OccurrenceStatus,
  UserRole,
} from '@cidade-em-foco/shared';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config();

/**
 * Totais do seed (docs/DECISOES.md §8). Os painéis exibem exatamente o que está
 * no banco, então estes números são gerados de verdade, sem projeção:
 * 1.284 = 212 pendentes + 120 em andamento + 912 concluídas + 40 não procedentes.
 */
export const SEED_STATUS_TOTALS: Array<[OccurrenceStatus, number]> = [
  [OccurrenceStatus.DONE, 912],
  [OccurrenceStatus.RECEIVED, 84],
  [OccurrenceStatus.IN_REVIEW, 72],
  [OccurrenceStatus.FORWARDED, 56],
  [OccurrenceStatus.SCHEDULED, 52],
  [OccurrenceStatus.IN_PROGRESS, 68],
  [OccurrenceStatus.REJECTED, 40],
];
export const SEED_TOTAL = SEED_STATUS_TOTALS.reduce((acc, [, n]) => acc + n, 0);
/** Nenhuma data do seed ultrapassa este instante (10/11/2026). */
const SEED_REFERENCE_NOW = Date.UTC(2026, 10, 10, 18, 0, 0);
const SEED_GROUP_SIZE = 7;
/** Estado de cada grupo de duplicidade (24 grupos x 7 relatos = 168 relatos agrupados). */
const SEED_GROUP_STATUSES: OccurrenceStatus[] = [
  ...Array(10).fill(OccurrenceStatus.DONE),
  ...Array(4).fill(OccurrenceStatus.RECEIVED),
  ...Array(3).fill(OccurrenceStatus.IN_REVIEW),
  ...Array(2).fill(OccurrenceStatus.FORWARDED),
  ...Array(2).fill(OccurrenceStatus.SCHEDULED),
  ...Array(3).fill(OccurrenceStatus.IN_PROGRESS),
];
const SEED_GROUPS = SEED_GROUP_STATUSES.length;
const GROUPED_COUNT = SEED_GROUPS * SEED_GROUP_SIZE;
/** Os relatos agrupados ficam no fim da sequência (mais recentes). */
const GROUPED_START = SEED_TOTAL - GROUPED_COUNT;

/**
 * Plano de estados dos relatos não agrupados: a cota de cada estado é o total
 * desejado menos o que já foi reservado para os grupos. A distribuição é
 * determinística e intercalada (algoritmo de "maior déficit"), para que cada
 * mês, bairro e categoria tenha a mesma mistura.
 */
function buildStatusPlan(): OccurrenceStatus[] {
  const quotas = SEED_STATUS_TOTALS.map(
    ([status, total]) =>
      total -
      SEED_GROUP_STATUSES.filter((s) => s === status).length * SEED_GROUP_SIZE,
  );
  const size = quotas.reduce((a, b) => a + b, 0);
  const produced = quotas.map(() => 0);
  const plan: OccurrenceStatus[] = [];
  for (let i = 0; i < size; i++) {
    let best = 0;
    let bestDeficit = -Infinity;
    quotas.forEach((quota, idx) => {
      const deficit = ((i + 1) * quota) / size - produced[idx];
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = idx;
      }
    });
    produced[best]++;
    plan.push(SEED_STATUS_TOTALS[best][0]);
  }
  return plan;
}

interface NeighborhoodSeedConfig {
  name: string;
  baseLat: number;
  baseLng: number;
  streets: string[];
}

const NEIGHBORHOOD_CONFIGS: NeighborhoodSeedConfig[] = [
  {
    name: 'Centro',
    baseLat: -23.5505,
    baseLng: -46.6333,
    streets: [
      'Rua Quinze de Novembro, 412',
      'Av. São João, 890',
      'Rua Direita, 125',
      'Praça da Sé, s/n',
      'Rua Boa Vista, 310',
    ],
  },
  {
    name: 'Zona Norte',
    baseLat: -23.5015,
    baseLng: -46.625,
    streets: [
      'Av. Cruzeiro do Sul, 2100',
      'Rua Voluntários da Pátria, 1540',
      'Av. Braz Leme, 780',
      'Rua Alfredo Pujol, 445',
      'Rua Conselheiro Saraiva, 310',
    ],
  },
  {
    name: 'Vila Nova',
    baseLat: -23.588,
    baseLng: -46.672,
    streets: [
      'Rua João Cachoeira, 620',
      'Av. Santo Amaro, 1450',
      'Rua Joaquim Floriano, 880',
      'Rua Clodomiro Amazonas, 290',
      'Av. Presidente Juscelino Kubitschek, 1100',
    ],
  },
  {
    name: 'Jardim das Flores',
    baseLat: -23.564,
    baseLng: -46.655,
    streets: [
      'Alameda Santos, 1800',
      'Rua Pamplona, 540',
      'Rua Bela Cintra, 920',
      'Rua Haddock Lobo, 350',
      'Alameda Campinas, 710',
    ],
  },
];

export async function runSeed(existingPool?: Pool): Promise<void> {
  const pool =
    existingPool ??
    new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'cidade_em_foco',
    });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verifica se o seed já rodou
    const existing = await client.query('SELECT COUNT(*)::int AS cnt FROM occurrences');
    if (existing.rows[0].cnt > 0) {
      console.log('[Seed] Banco de dados já populado. Ignorando seed.');
      await client.query('COMMIT');
      return;
    }

    console.log('[Seed] Populando departamentos, categorias, usuários e ocorrências...');

    // 1. Departamentos obrigatórios (Seção 4)
    const departmentsData = [
      { name: 'Obras e Infraestrutura', deadline: 3 },
      { name: 'Iluminação Pública', deadline: 2 },
      { name: 'Serviços Urbanos', deadline: 2 },
      { name: 'Meio Ambiente', deadline: 5 },
    ];

    const deptMap: Record<string, { id: string; deadline: number }> = {};
    for (const d of departmentsData) {
      deptMap[d.name] = {
        id: await ensureDepartment(client, d.name, d.deadline),
        deadline: d.deadline,
      };
    }

    // 2. Categorias obrigatórias (Seção 4)
    const categoriesData = [
      {
        slug: 'pavimentacao',
        name: 'Pavimentação',
        icon: 'road',
        dept: 'Obras e Infraestrutura',
        execDays: 10,
        sampleTitles: [
          'Buraco profundo na faixa da direita',
          'Asfalto cedendo próximo à faixa de pedestres',
          'Afundamento na pista após chuva forte',
        ],
      },
      {
        slug: 'iluminacao',
        name: 'Iluminação',
        icon: 'lightbulb',
        dept: 'Iluminação Pública',
        execDays: 5,
        sampleTitles: [
          'Poste apagado em frente ao ponto de ônibus',
          'Luminária piscando durante toda a noite',
          'Trecho da rua totalmente no escuro',
        ],
      },
      {
        slug: 'limpeza-urbana',
        name: 'Limpeza urbana',
        icon: 'trash',
        dept: 'Serviços Urbanos',
        execDays: 4,
        sampleTitles: [
          'Descarte irregular de entulho na calçada',
          'Acúmulo de resíduos sólidos na esquina',
          'Lixeira pública danificada e transbordando',
        ],
      },
      {
        slug: 'acessibilidade',
        name: 'Acessibilidade',
        icon: 'wheelchair',
        dept: 'Obras e Infraestrutura',
        execDays: 15,
        sampleTitles: [
          'Rampa de cadeirante bloqueada por degrau alto',
          'Piso tátil solto na esquina movimentada',
          'Calçada quebrada impedindo passagem de cadeira de rodas',
        ],
      },
      {
        slug: 'sinalizacao',
        name: 'Sinalização',
        icon: 'signpost',
        dept: 'Obras e Infraestrutura',
        execDays: 7,
        sampleTitles: [
          'Placa de Pare caída sobre o passeio',
          'Faixa de pedestres totalmente apagada',
          'Semáforo de pedestres com lâmpada queimada',
        ],
      },
      {
        slug: 'areas-verdes',
        name: 'Áreas verdes',
        icon: 'tree',
        dept: 'Meio Ambiente',
        execDays: 10,
        sampleTitles: [
          'Galho de árvore de grande porte ameaçando cair',
          'Mato alto encobrindo a calçada da praça',
          'Necessidade de poda preventiva junto à fiação',
        ],
      },
      {
        slug: 'drenagem',
        name: 'Drenagem',
        icon: 'droplet',
        dept: 'Obras e Infraestrutura',
        execDays: 7,
        sampleTitles: [
          'Bueiro entupido provocando alagamento na via',
          'Grelha de boca de lobo quebrada com risco a pedestres',
          'Água empoçada sem escoamento pluvial',
        ],
      },
    ];

    const catList: Array<{
      id: string;
      slug: string;
      name: string;
      deptId: string;
      respDays: number;
      execDays: number;
      sampleTitles: string[];
    }> = [];

    for (const c of categoriesData) {
      const dept = deptMap[c.dept];
      const res = await client.query(
        `INSERT INTO categories (slug, name, icon, department_id, execution_deadline_days, active)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
        [c.slug, c.name, c.icon, dept.id, c.execDays],
      );
      catList.push({
        id: res.rows[0].id,
        slug: c.slug,
        name: c.name,
        deptId: dept.id,
        respDays: dept.deadline,
        execDays: c.execDays,
        sampleTitles: c.sampleTitles,
      });
    }

    // 3. Usuários: os 5 básicos (1 de cada tipo) + demais departamentos e cidadãos de demonstração
    const passwordHash = await bcrypt.hash(seedPassword(), 10);
    const baseIds: Record<string, string> = {};
    for (const spec of BASE_USERS) {
      baseIds[spec.email] = await ensureUser(
        client,
        spec,
        passwordHash,
        spec.department ? deptMap[spec.department].id : null,
      );
    }
    const adminId = baseIds['admin@cidadeemfoco.gov.br'];
    const triageId = baseIds['triagem@cidadeemfoco.gov.br'];

    const deptUsers: Record<string, string> = {};
    const extraDeptUsers = [
      { name: 'Eng. Marcos Ribeiro (Obras)', email: 'obras@cidadeemfoco.gov.br', dept: 'Obras e Infraestrutura' },
      { name: 'Juliana Freitas (Iluminação)', email: 'iluminacao@cidadeemfoco.gov.br', dept: 'Iluminação Pública' },
      { name: 'Fernando Costa (Serviços Urbanos)', email: 'servicos@cidadeemfoco.gov.br', dept: 'Serviços Urbanos' },
      { name: 'Biól. Patrícia Lima (Meio Ambiente)', email: 'meioambiente@cidadeemfoco.gov.br', dept: 'Meio Ambiente' },
    ];
    for (const du of extraDeptUsers) {
      const dId = deptMap[du.dept].id;
      deptUsers[dId] = await ensureUser(
        client,
        { name: du.name, email: du.email, phone: '(11) 3113-9100', role: UserRole.DEPARTMENT, department: du.dept },
        passwordHash,
        dId,
      );
    }

    const citizenIds: string[] = [baseIds['mariana.souza@exemplo.com.br']];
    for (const cit of [
      { name: 'Carlos Eduardo Santos', email: 'carlos.santos@exemplo.com.br', phone: '(11) 97654-3210' },
      { name: 'Ana Paula Ferreira', email: 'ana.ferreira@exemplo.com.br', phone: '(11) 96543-2109' },
    ]) {
      citizenIds.push(
        await ensureUser(client, { ...cit, role: UserRole.CITIZEN }, passwordHash),
      );
    }

    // 4. Gerar as ocorrências nos 4 bairros (Maio a Outubro de 2026)
    const statusPlan = buildStatusPlan();

    // Grupos de duplicidades para demonstrar agrupamento geográfico e "+N semelhantes"
    const groupIds: string[] = [];
    for (let g = 0; g < SEED_GROUPS; g++) {
      const gRes = await client.query(
        `INSERT INTO occurrence_groups DEFAULT VALUES RETURNING id`,
      );
      groupIds.push(gRes.rows[0].id);
    }
    // Estado, categoria e local compartilhados por todos os relatos de um mesmo grupo
    const groupShared = new Map<
      string,
      { catIndex: number; nbIndex: number; lat: number; lng: number }
    >();

    let seq = 4800;
    for (let i = 0; i < SEED_TOTAL; i++) {
      seq++;
      const protocol = `CF-2026-${String(seq).padStart(6, '0')}`;
      const groupIndex =
        i >= GROUPED_START ? (i - GROUPED_START) % SEED_GROUPS : -1;
      const status =
        groupIndex >= 0 ? SEED_GROUP_STATUSES[groupIndex] : statusPlan[i];

      // Distribuição ponderada para Obras e Infraestrutura ter o maior volume, seguido por Iluminação, Serviços Urbanos e Meio Ambiente
      const catWeights = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6];
      let catIndex = catWeights[(i * 7) % catWeights.length];
      // Pesos por bairro: Centro concentra mais relatos, seguido de Zona Norte, Vila Nova e Jardim das Flores
      const nbWeights = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 0, 1, 2, 3];
      let nbIndex = nbWeights[(i * 5) % nbWeights.length];

      // Relatos de um mesmo grupo de duplicidade compartilham categoria, bairro, ponto e estado
      const groupIdForRow = groupIndex >= 0 ? groupIds[groupIndex] : null;
      const shared = groupIdForRow ? groupShared.get(groupIdForRow) : undefined;
      if (shared) {
        catIndex = shared.catIndex;
        nbIndex = shared.nbIndex;
      }

      const cat = catList[catIndex];
      const nbConfig = NEIGHBORHOOD_CONFIGS[nbIndex];
      const street = nbConfig.streets[i % nbConfig.streets.length];
      const title = cat.sampleTitles[i % cat.sampleTitles.length];
      const description = `${title} na altura de ${street}, bairro ${nbConfig.name}. Situação verificada pelos moradores locais necessitando vistoria técnica da equipe municipal.`;

      // Pequeno deslocamento determinístico nas coordenadas do bairro
      const latOffset = (((i * 17) % 41) - 20) * 0.00045;
      const lngOffset = (((i * 31) % 43) - 21) * 0.00045;
      let lat = Number((nbConfig.baseLat + latOffset).toFixed(6));
      let lng = Number((nbConfig.baseLng + lngOffset).toFixed(6));
      if (shared) {
        // Até ~20 m do relato principal do grupo
        lat = Number((shared.lat + ((i % 5) - 2) * 0.00004).toFixed(6));
        lng = Number((shared.lng + ((i % 3) - 1) * 0.00004).toFixed(6));
      }

      // Data de criação distribuída entre Maio e Outubro de 2026 (meses 4 a 9 em 0-based)
      // Sequência cronológica: o protocolo cresce junto com a data de registro
      const PERIOD_START = Date.UTC(2026, 4, 1, 11, 0, 0);
      const PERIOD_END = Date.UTC(2026, 9, 31, 20, 0, 0);
      const createdAt = new Date(
        PERIOD_START +
          Math.floor(((PERIOD_END - PERIOD_START) * i) / (SEED_TOTAL - 1)),
      );

      const responseDueAt = new Date(
        createdAt.getTime() + cat.respDays * 24 * 60 * 60 * 1000,
      );
      const executionDueAt = new Date(
        createdAt.getTime() + cat.execDays * 24 * 60 * 60 * 1000,
      );

      // Associa os relatos finais aos grupos de duplicidade (7 relatos por grupo)
      let groupId: string | null = null;
      let isGroupMain = true;
      if (groupIdForRow) {
        groupId = groupIdForRow;
        if (shared) {
          isGroupMain = false;
        } else {
          groupShared.set(groupId, { catIndex, nbIndex, lat, lng });
        }
      }

      // Não procedentes encerram logo após a triagem. Concluídas levam de 50% a 120% do
      // prazo de execução da categoria (mínimo de 3,6 dias), então parte delas estoura o prazo.
      const durationDays = Math.max(
        3.6,
        cat.execDays * (0.5 + ((i * 7) % 8) / 10),
      );
      const closedAt =
        status === OccurrenceStatus.REJECTED
          ? new Date(createdAt.getTime() + 60 * 60 * 60 * 1000)
          : status === OccurrenceStatus.DONE
            ? new Date(
                Math.min(
                  createdAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
                  SEED_REFERENCE_NOW,
                ),
              )
            : null;

      const priority: OccurrencePriority =
        groupId || i % 7 === 0
          ? OccurrencePriority.HIGH
          : i % 3 === 0
            ? OccurrencePriority.MEDIUM
            : OccurrencePriority.LOW;

      // Garante que Mariana Souza (citizenIds[0]) seja dona de várias ocorrências (incluindo CF-2026-004812)
      const requesterId =
        seq === 4812
          ? citizenIds[0]
          : i % 4 === 0
            ? citizenIds[0]
            : i % 4 === 1
              ? citizenIds[1]
              : i % 4 === 2
                ? citizenIds[2]
                : null;

      const occRes = await client.query(
        `INSERT INTO occurrences (
          protocol, category_id, title, description, reference_point,
          address_text, neighborhood, location, status, priority,
          department_id, requester_id, group_id, is_group_main,
          response_due_at, execution_due_at, closed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19, $20
        ) RETURNING id`,
        [
          protocol,
          cat.id,
          title,
          description,
          'Próximo ao comércio local',
          `${street} - ${nbConfig.name}`,
          nbConfig.name,
          lng,
          lat,
          status,
          priority,
          cat.deptId,
          requesterId,
          groupId,
          isGroupMain,
          responseDueAt.toISOString(),
          executionDueAt.toISOString(),
          closedAt ? closedAt.toISOString() : null,
          createdAt.toISOString(),
          (closedAt || createdAt).toISOString(),
        ],
      );

      const occId = occRes.rows[0].id;

      if (groupId && isGroupMain) {
        await client.query(
          `UPDATE occurrence_groups SET main_occurrence_id = $1 WHERE id = $2`,
          [occId, groupId],
        );
      }

      // Fotos de placeholder para todas as ocorrências
      await client.query(
        `INSERT INTO occurrence_photos (occurrence_id, storage_key, thumb_key, position, created_at)
         VALUES ($1, $2, $3, 0, $4), ($1, $5, $6, 1, $4)`,
        [
          occId,
          `placeholder/${cat.slug}-1.svg`,
          `placeholder/${cat.slug}-1-thumb.svg`,
          createdAt.toISOString(),
          `placeholder/${cat.slug}-2.svg`,
          `placeholder/${cat.slug}-2-thumb.svg`,
        ],
      );

      // Histórico de status realista (tempo de triagem médio ~1,8 dia)
      await client.query(
        `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
         VALUES ($1, NULL, 'received', 'Solicitação registrada na plataforma Cidade em Foco.', $2, TRUE, $3)`,
        [occId, requesterId, createdAt.toISOString()],
      );

      if (status !== OccurrenceStatus.RECEIVED) {
        // Triagem ocorre entre 31 e 55 horas após o registro (média de ~1,8 dia)
        const triageDate = new Date(
          createdAt.getTime() + (31 + ((i * 5) % 25)) * 60 * 60 * 1000,
        );
        await client.query(
          `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
           VALUES ($1, 'received', 'in_review', 'Triagem concluída. Solicitação validada para encaminhamento técnico.', $2, TRUE, $3)`,
          [occId, triageId, triageDate.toISOString()],
        );

        if (status === OccurrenceStatus.REJECTED) {
          const rejectDate = closedAt as Date;
          await client.query(
            `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
             VALUES ($1, 'in_review', 'rejected', 'Após vistoria, constatou-se tratar de área particular interna de condomínio, fora da competência de zeladoria municipal.', $2, TRUE, $3)`,
            [occId, triageId, rejectDate.toISOString()],
          );
        } else if (status !== OccurrenceStatus.IN_REVIEW) {
          const forwardDate = new Date(triageDate.getTime() + 6 * 60 * 60 * 1000);
          await client.query(
            `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
             VALUES ($1, 'in_review', 'forwarded', 'Encaminhada à secretaria competente para programação de equipe.', $2, TRUE, $3)`,
            [occId, triageId, forwardDate.toISOString()],
          );

          const deptActor = deptUsers[cat.deptId] || adminId;
          if (
            status === OccurrenceStatus.SCHEDULED ||
            status === OccurrenceStatus.IN_PROGRESS ||
            status === OccurrenceStatus.DONE
          ) {
            const schedDate = new Date(forwardDate.getTime() + 10 * 60 * 60 * 1000);
            await client.query(
              `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
               VALUES ($1, 'forwarded', 'scheduled', 'Atendimento incluído no cronograma operacional da semana.', $2, TRUE, $3)`,
              [occId, deptActor, schedDate.toISOString()],
            );

            if (
              status === OccurrenceStatus.IN_PROGRESS ||
              status === OccurrenceStatus.DONE
            ) {
              const progDate = new Date(schedDate.getTime() + 14 * 60 * 60 * 1000);
              await client.query(
                `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
                 VALUES ($1, 'scheduled', 'in_progress', 'Equipe técnica em campo realizando o atendimento.', $2, TRUE, $3)`,
                [occId, deptActor, progDate.toISOString()],
              );

              if (status === OccurrenceStatus.DONE && closedAt) {
                await client.query(
                  `INSERT INTO status_history (occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen, created_at)
                   VALUES ($1, 'in_progress', 'done', 'Serviço concluído e vistoriado pela equipe técnica.', $2, TRUE, $3)`,
                  [occId, deptActor, closedAt.toISOString()],
                );
              }
            }
          }
        }
      }

      // Avaliações em ~60% das concluídas (~82% positivas: 4 ou 5 estrelas)
      if (status === OccurrenceStatus.DONE && i % 5 < 3) {
        const isPositive = (i * 13) % 100 < 82;
        const stars = isPositive ? (i % 2 === 0 ? 5 : 4) : 3;
        const comment = isPositive
          ? 'Atendimento dentro do prazo e comunicação transparente pelo protocolo.'
          : 'Problema resolvido, mas levou alguns dias a mais que o esperado.';
        await client.query(
          `INSERT INTO ratings (occurrence_id, stars, comment, created_at)
           VALUES ($1, $2, $3, $4)`,
          [occId, stars, comment, (closedAt || createdAt).toISOString()],
        );
      }

      // Notificação in-app para o cidadão
      if (requesterId && status !== OccurrenceStatus.RECEIVED) {
        await client.query(
          `INSERT INTO notifications (user_id, occurrence_id, type, title, body, created_at)
           VALUES ($1, $2, 'status_changed', $3, $4, $5)`,
          [
            requesterId,
            occId,
            `Atualização no protocolo ${protocol}`,
            `Sua solicitação ${protocol} mudou para ${OCCURRENCE_STATUS_LABELS[status]}.`,
            (closedAt || createdAt).toISOString(),
          ],
        );
      }
    }

    // Atualiza contador de protocolos de 2026
    await client.query(
      `INSERT INTO protocol_counters (year, last_value) VALUES (2026, $1)
       ON CONFLICT (year) DO UPDATE SET last_value = EXCLUDED.last_value`,
      [seq],
    );

    // Log inicial de auditoria
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, after, ip)
       VALUES ($1, 'SEED_INITIALIZED', 'system', 'seed-2026', $2::jsonb, '127.0.0.1')`,
      [adminId, JSON.stringify({ occurrences: SEED_TOTAL })],
    );

    await client.query('COMMIT');
    console.log(`[Seed] Concluído com sucesso (${SEED_TOTAL} ocorrências, 4 bairros, 7 categorias).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Erro ao popular banco:', err);
    throw err;
  } finally {
    client.release();
    if (!existingPool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runSeed().catch(() => process.exit(1));
  // (falhas já foram registradas no console por runSeed)
}
