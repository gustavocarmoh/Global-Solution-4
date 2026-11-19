import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  OccurrencePriority,
  OccurrenceStatus,
  UserRole,
} from '@cidade-em-foco/shared';
import { OccurrencesService } from './occurrences.service';
import { ReportsService } from '../reports/reports.module';

describe('Regras de Negócio — Cidade em Foco (Regras 4, 5 e 12)', () => {
  describe('Regra 4: Transições de Estado e Justificativa Obrigatória', () => {
    const mockDb: any = {};
    const mockPhotos: any = {};
    const service = new OccurrencesService(mockDb, mockPhotos);

    it('deve permitir avanço normal ou pulo de etapa por usuário de triagem', () => {
      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.RECEIVED,
          toStatus: OccurrenceStatus.IN_PROGRESS,
          actorRole: UserRole.TRIAGE,
          justification: 'Equipe acionada em regime prioritário.',
        }),
      ).not.toThrow();
    });

    it('deve rejeitar mudança para Não procedente sem justificativa obrigatória', () => {
      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.IN_REVIEW,
          toStatus: OccurrenceStatus.REJECTED,
          actorRole: UserRole.TRIAGE,
          justification: '   ',
        }),
      ).toThrow(BadRequestException);
    });

    it('deve permitir mudança para Não procedente quando justificativa válida é informada', () => {
      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.IN_REVIEW,
          toStatus: OccurrenceStatus.REJECTED,
          actorRole: UserRole.TRIAGE,
          justification:
            'Área interna de condomínio privado, fora da competência municipal.',
        }),
      ).not.toThrow();
    });

    it('deve bloquear reabertura de ocorrência Concluída ou Não procedente por perfil Triagem ou Departamento', () => {
      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.DONE,
          toStatus: OccurrenceStatus.IN_PROGRESS,
          actorRole: UserRole.DEPARTMENT,
          justification: 'Tentativa de reabertura.',
        }),
      ).toThrow(ForbiddenException);

      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.REJECTED,
          toStatus: OccurrenceStatus.IN_REVIEW,
          actorRole: UserRole.TRIAGE,
          justification: 'Tentativa de reabertura.',
        }),
      ).toThrow(ForbiddenException);
    });

    it('deve permitir reabertura de ocorrência Concluída por Gestor ou Administrador', () => {
      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.DONE,
          toStatus: OccurrenceStatus.IN_PROGRESS,
          actorRole: UserRole.MANAGER,
          justification: 'Reaberta após revisão de controle de qualidade.',
        }),
      ).not.toThrow();

      expect(() =>
        service.validateStatusTransition({
          fromStatus: OccurrenceStatus.REJECTED,
          toStatus: OccurrenceStatus.IN_REVIEW,
          actorRole: UserRole.ADMIN,
          justification: 'Reaberta pelo administrador após novo parecer.',
        }),
      ).not.toThrow();
    });
  });

  describe('Regra 5 e Regra 8: Detecção de Duplicidades (≤ 50m + pg_trgm) e Prioridade Alta (≥ 5 relatos)', () => {
    it('deve associar ocorrência ao grupo existente quando encontrar relato aberto semelhante a até 50m e elevar prioridade para Alta com 5 relatos', async () => {
      const queriesExecuted: Array<{ sql: string; params: any[] }> = [];

      const mockClient = {
        query: jest.fn(async (sql: string, params: any[] = []) => {
          queriesExecuted.push({ sql, params });
          if (sql.includes('FROM categories c')) {
            return {
              rows: [
                {
                  id: '11111111-1111-4111-8111-111111111101',
                  name: 'Pavimentação',
                  slug: 'pavimentacao',
                  department_id: 'dept-obras',
                  execution_deadline_days: 10,
                  response_deadline_days: 3,
                },
              ],
            };
          }
          if (sql.includes('INSERT INTO protocol_counters')) {
            return { rows: [{ last_value: 5031 }] };
          }
          if (sql.includes('ST_DWithin')) {
            return {
              rows: [
                {
                  id: 'occ-main-1',
                  group_id: 'group-uuid-99',
                  created_at: new Date().toISOString(),
                },
              ],
            };
          }
          if (sql.includes('SELECT COUNT(*)::int AS cnt FROM occurrences WHERE group_id')) {
            return { rows: [{ cnt: 4 }] }; // 4 existentes + 1 nova = 5 -> Prioridade Alta
          }
          if (sql.includes('INSERT INTO occurrences')) {
            return {
              rows: [
                {
                  id: 'occ-new-5031',
                  protocol: 'CF-2026-005031',
                  status: OccurrenceStatus.RECEIVED,
                  priority: params[9],
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const mockDb: any = {
        withTransaction: (fn: any) => fn(mockClient),
      };
      const mockPhotos: any = {
        processAndStorePhotos: jest.fn().mockResolvedValue([]),
      };

      const service = new OccurrencesService(mockDb, mockPhotos);
      const result = await service.createOccurrence({
        rawBody: {
          categoryId: '11111111-1111-4111-8111-111111111101',
          description: 'Buraco profundo na faixa da direita próximo ao cruzamento.',
          addressText: 'Rua Quinze de Novembro, 412',
          neighborhood: 'Centro',
          latitude: -23.5505,
          longitude: -46.6333,
        },
      });

      expect(result.protocol).toBe('CF-2026-005031');
      expect(result.groupedWithSimilar).toBe(true);
      expect(result.priority).toBe(OccurrencePriority.HIGH);
    });
  });

  describe('Regra 12: Cálculo dos 8 Indicadores e Metas Iniciais', () => {
    const reportsService = new ReportsService({} as any);

    it('deve calcular corretamente o status atingida/abaixo da meta/em acompanhamento para os 8 indicadores', () => {
      const kpis = reportsService.evaluateKpiMetrics({
        totalRegistered: 1284,
        withLocationPct: 100,
        withProtocolPct: 100,
        avgTriageDays: 1.8,
        baselineTriageDays: 2.25, // meta -20% = 1.80
        withStatusUpdatePct: 93,
        resolutionRatePct: 71,
        satisfactionPct: 82,
        duplicatesIdentified: 168,
      });

      expect(kpis).toHaveLength(8);
      expect(kpis[0].status).toBe('em acompanhamento');
      expect(kpis[1].status).toBe('atingida'); // 100% >= 90%
      expect(kpis[2].status).toBe('atingida'); // 100% == 100%
      expect(kpis[3].status).toBe('atingida'); // 1.8 <= 1.8
      expect(kpis[4].status).toBe('atingida'); // 93% >= 90%
      expect(kpis[5].status).toBe('atingida'); // 71% >= 70%
      expect(kpis[6].status).toBe('atingida'); // 82% >= 80%
      expect(kpis[7].status).toBe('atingida'); // 168 agrupadas
    });

    it('deve sinalizar "abaixo da meta" quando satisfação < 80% ou triagem > meta', () => {
      const kpis = reportsService.evaluateKpiMetrics({
        totalRegistered: 500,
        withLocationPct: 85,
        withProtocolPct: 100,
        avgTriageDays: 2.1,
        baselineTriageDays: 2.25,
        withStatusUpdatePct: 88,
        resolutionRatePct: 60,
        satisfactionPct: 74,
        duplicatesIdentified: 12,
      });

      expect(kpis[1].status).toBe('abaixo da meta'); // 85% < 90%
      expect(kpis[3].status).toBe('abaixo da meta'); // 2.1 > 1.8
      expect(kpis[4].status).toBe('abaixo da meta'); // 88% < 90%
      expect(kpis[6].status).toBe('abaixo da meta'); // 74% < 80%
    });
  });
});
