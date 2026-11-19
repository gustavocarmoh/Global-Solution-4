import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OCCURRENCE_STATUS_LABELS, OccurrenceStatus } from '@cidade-em-foco/shared';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service';
import { CsvColumn, toCsv } from '../common/csv';
import { formatPeriod, MONTH_ABBR } from '../common/period';

/**
 * Transparência pública: todos os números saem diretamente do banco, sem
 * projeções nem valores padrão. Indicador sem base de cálculo retorna null.
 */
@Injectable()
export class PublicStatsService {
  constructor(private readonly db: DatabaseService) {}

  async getSummaryStats() {
    const res = await this.db.query(
      `SELECT
          COUNT(*)::int AS registered,
          COUNT(*) FILTER (WHERE status = 'done')::int AS resolved,
          ROUND(
            (AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400.0)
              FILTER (WHERE status = 'done' AND closed_at IS NOT NULL))::numeric,
            1
          )::float AS "avgResolutionDays",
          MIN(created_at) AS first_at,
          MAX(created_at) AS last_at
       FROM occurrences`,
    );

    const ratingRes = await this.db.query(
      `SELECT
          COUNT(*)::int AS total_ratings,
          COUNT(*) FILTER (WHERE stars >= 4)::int AS positive_ratings
       FROM ratings`,
    );

    const totalRatings = ratingRes.rows[0]?.total_ratings || 0;
    const positiveRatings = ratingRes.rows[0]?.positive_ratings || 0;
    const row = res.rows[0];

    return {
      period: formatPeriod(row.first_at, row.last_at),
      registered: row.registered,
      resolved: row.resolved,
      avgResolutionDays: row.avgResolutionDays ?? null,
      satisfactionPct:
        totalRatings > 0
          ? Math.round((positiveRatings / totalRatings) * 100)
          : null,
      totalRatings,
    };
  }

  async getByNeighborhood() {
    const res = await this.db.query(
      `SELECT neighborhood AS label, COUNT(*)::int AS value
       FROM occurrences
       GROUP BY neighborhood
       ORDER BY value DESC, label ASC`,
    );
    return res.rows;
  }

  async getByCategory() {
    const res = await this.db.query(
      `SELECT c.name AS label, c.slug, c.icon, COUNT(o.id)::int AS value
       FROM categories c
       LEFT JOIN occurrences o ON o.category_id = c.id
       WHERE c.active = TRUE OR o.id IS NOT NULL
       GROUP BY c.id
       ORDER BY value DESC, label ASC`,
    );
    return res.rows;
  }

  /**
   * Base aberta e anonimizada: uma linha por solicitação, só com protocolo, categoria,
   * departamento, bairro, estado e datas. Sem descrição, endereço, coordenadas ou dados pessoais.
   */
  async getOpenData() {
    const res = await this.db.query(
      `SELECT o.protocol, c.name AS category, d.name AS department, o.neighborhood,
              o.status, o.priority,
              to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "createdAt",
              to_char(o.closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "closedAt"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       ORDER BY o.created_at DESC
       LIMIT 50000`,
    );
    return res.rows.map((r) => ({
      ...r,
      statusLabel: OCCURRENCE_STATUS_LABELS[r.status as OccurrenceStatus] ?? r.status,
    }));
  }

  /** Série dos últimos 6 meses com registros (registradas x solucionadas). */
  async getMonthlySeries() {
    const res = await this.db.query(
      `SELECT * FROM (
         SELECT
            to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month_start,
            COUNT(*)::int AS registered,
            COUNT(*) FILTER (WHERE status = 'done')::int AS resolved
         FROM occurrences
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 6
       ) recent
       ORDER BY month_start ASC`,
    );

    return res.rows.map((r) => {
      const [year, month] = String(r.month_start).split('-');
      return {
        month: `${MONTH_ABBR[Number(month) - 1]}/${year.slice(2)}`,
        registered: r.registered,
        resolved: r.resolved,
      };
    });
  }
}

@ApiTags('Transparência Pública (Dados Agregados sem Login)')
@Controller('public/stats')
export class PublicStatsController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Retorna totais públicos agregados: Registradas, Solucionadas, Tempo médio de resolução e % de satisfação',
  })
  async getSummary() {
    return this.publicStatsService.getSummaryStats();
  }

  @Get('by-neighborhood')
  @ApiOperation({ summary: 'Série agregada de solicitações por bairro' })
  async getByNeighborhood() {
    return this.publicStatsService.getByNeighborhood();
  }

  @Get('by-category')
  @ApiOperation({ summary: 'Série agregada de solicitações por categoria (com ícones)' })
  async getByCategory() {
    return this.publicStatsService.getByCategory();
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Série mensal (últimos 6 meses com registros) de registradas x solucionadas' })
  async getMonthly() {
    return this.publicStatsService.getMonthlySeries();
  }
}

export const OPEN_DATA_COLUMNS: CsvColumn[] = [
  { key: 'protocol', label: 'protocolo' },
  { key: 'category', label: 'categoria' },
  { key: 'department', label: 'departamento' },
  { key: 'neighborhood', label: 'bairro' },
  { key: 'statusLabel', label: 'estado' },
  { key: 'priority', label: 'prioridade' },
  { key: 'createdAt', label: 'registrada_em' },
  { key: 'closedAt', label: 'encerrada_em' },
];

@ApiTags('Dados Abertos (sem login, anonimizados)')
@Controller('public/open-data')
export class OpenDataController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Base anonimizada das solicitações (?format=csv para planilha; padrão JSON)' })
  async download(
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const items = await this.publicStatsService.getOpenData();
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cidade-em-foco-dados-abertos.csv"');
      return toCsv(items, OPEN_DATA_COLUMNS);
    }
    res.setHeader('Content-Disposition', 'attachment; filename="cidade-em-foco-dados-abertos.json"');
    return {
      generatedAt: new Date().toISOString(),
      notice: 'Dados anonimizados: não há descrição, endereço, coordenadas nem dados pessoais.',
      total: items.length,
      items,
    };
  }
}

@Module({
  controllers: [PublicStatsController, OpenDataController],
  providers: [PublicStatsService],
  exports: [PublicStatsService],
})
export class PublicStatsModule {}
