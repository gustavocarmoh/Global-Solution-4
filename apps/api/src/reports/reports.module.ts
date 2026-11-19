import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { formatPeriod, MONTH_FULL } from '../common/period';
import { toCsv } from '../common/csv';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators';

export interface KpiRow {
  id: string;
  indicator: string;
  objective: string;
  target: string;
  result: string;
  status: 'atingida' | 'abaixo da meta' | 'em acompanhamento';
}

/** Linha de base histórica do tempo médio de triagem (docs/DECISOES.md §7). */
export const TRIAGE_BASELINE_DAYS = 2.25;

export interface ReportColumn {
  key: string;
  label: string;
}

export const REPORT_COLUMNS: Record<string, ReportColumn[]> = {
  monthly: [
    { key: 'month', label: 'Mês' },
    { key: 'registered', label: 'Registradas' },
    { key: 'resolved', label: 'Concluídas' },
    { key: 'rejected', label: 'Não procedentes' },
    { key: 'open', label: 'Em aberto' },
  ],
  byDepartment: [
    { key: 'department', label: 'Departamento' },
    { key: 'totalDemands', label: 'Demandas' },
    { key: 'resolved', label: 'Concluídas' },
    { key: 'open', label: 'Em aberto' },
    { key: 'avgResolutionDays', label: 'Tempo médio de resolução (dias)' },
    { key: 'deadlineCompliancePct', label: 'Concluídas no prazo (%)' },
  ],
  recurring: [
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'categoryName', label: 'Categoria' },
    { key: 'count', label: 'Ocorrências' },
    { key: 'open', label: 'Em aberto' },
  ],
};

/**
 * Todos os números deste serviço são calculados diretamente no banco.
 * Usuários do perfil Departamento enxergam apenas os dados do próprio departamento (Regra 9).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  private scope(user?: AuthenticatedUser, alias = 'o') {
    if (user?.role === UserRole.DEPARTMENT) {
      return {
        where: `WHERE ${alias}.department_id = $1`,
        and: `AND ${alias}.department_id = $1`,
        params: [user.departmentId ?? null] as any[],
      };
    }
    return { where: '', and: '', params: [] as any[] };
  }

  /**
   * Dashboard Administrativo (Seção 8.10):
   * total = pendentes + em andamento + concluídas + não procedentes (por construção da consulta)
   */
  async getAdminDashboard(user?: AuthenticatedUser) {
    const sc = this.scope(user);

    const countsRes = await this.db.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.status IN ('received', 'in_review', 'forwarded'))::int AS pending,
          COUNT(*) FILTER (WHERE o.status IN ('scheduled', 'in_progress'))::int AS in_progress,
          COUNT(*) FILTER (WHERE o.status = 'done')::int AS done,
          COUNT(*) FILTER (WHERE o.status = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE o.group_id IS NOT NULL)::int AS duplicates,
          MIN(o.created_at) AS first_at,
          MAX(o.created_at) AS last_at
       FROM occurrences o
       ${sc.where}`,
      sc.params,
    );
    const row = countsRes.rows[0];

    // Tempo médio de triagem: da criação até a primeira saída do estado Recebida
    const triageRes = await this.db.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (t.first_triage - o.created_at)) / 86400.0)::numeric, 1)::float AS avg_triage_days
       FROM occurrences o
       JOIN (
         SELECT occurrence_id, MIN(created_at) AS first_triage
         FROM status_history
         WHERE from_status = 'received' AND to_status <> 'received'
         GROUP BY occurrence_id
       ) t ON t.occurrence_id = o.id
       ${sc.where}`,
      sc.params,
    );
    const avgTriageDays: number | null = triageRes.rows[0]?.avg_triage_days ?? null;

    const ratingRes = await this.db.query(
      `SELECT
          COUNT(*)::int AS total_ratings,
          COUNT(*) FILTER (WHERE r.stars >= 4)::int AS positive_ratings
       FROM ratings r
       JOIN occurrences o ON o.id = r.occurrence_id
       ${sc.where}`,
      sc.params,
    );
    const totalRatings = ratingRes.rows[0]?.total_ratings || 0;
    const positiveRatings = ratingRes.rows[0]?.positive_ratings || 0;

    const recurringRes = await this.db.query(
      `SELECT c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              o.neighborhood, COUNT(*)::int AS count
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${sc.where}
       GROUP BY c.id, o.neighborhood
       ORDER BY count DESC, c.name ASC, o.neighborhood ASC
       LIMIT 5`,
      sc.params,
    );

    const geoClustersRes = await this.db.query(
      `SELECT o.neighborhood,
              COUNT(*)::int AS count,
              ROUND(AVG(ST_Y(o.location::geometry))::numeric, 4)::float AS latitude,
              ROUND(AVG(ST_X(o.location::geometry))::numeric, 4)::float AS longitude
       FROM occurrences o
       ${sc.where}
       GROUP BY o.neighborhood
       ORDER BY count DESC`,
      sc.params,
    );

    const byDeptRes = await this.db.query(
      `SELECT d.name AS label, COUNT(o.id)::int AS value
       FROM departments d
       LEFT JOIN occurrences o ON o.department_id = d.id
       ${user?.role === UserRole.DEPARTMENT ? 'WHERE d.id = $1' : 'WHERE d.active = TRUE OR o.id IS NOT NULL'}
       GROUP BY d.id
       ORDER BY value DESC, label ASC`,
      sc.params,
    );

    return {
      period: formatPeriod(row.first_at, row.last_at),
      kpis: {
        total: row.total,
        pending: row.pending,
        inProgress: row.in_progress,
        done: row.done,
        rejected: row.rejected,
        avgTriageDays,
        triageBaselineDays: TRIAGE_BASELINE_DAYS,
        triageChangePct:
          avgTriageDays === null
            ? null
            : Math.round(
                ((avgTriageDays - TRIAGE_BASELINE_DAYS) / TRIAGE_BASELINE_DAYS) * 100,
              ),
        satisfactionPct:
          totalRatings > 0
            ? Math.round((positiveRatings / totalRatings) * 100)
            : null,
        totalRatings,
        duplicates: row.duplicates,
      },
      recurringProblems: recurringRes.rows,
      geographicClusters: geoClustersRes.rows,
      demandsByDepartment: byDeptRes.rows,
    };
  }

  /**
   * Regra 12: Os 8 indicadores e metas iniciais calculados no banco
   */
  public evaluateKpiMetrics(metrics: {
    totalRegistered: number;
    withLocationPct: number;
    withProtocolPct: number;
    avgTriageDays: number | null;
    baselineTriageDays: number;
    withStatusUpdatePct: number;
    resolutionRatePct: number;
    satisfactionPct: number | null;
    duplicatesIdentified: number;
  }): KpiRow[] {
    const targetTriageDays = Number((metrics.baselineTriageDays * 0.8).toFixed(2)); // Redução de 20%

    return [
      {
        id: 'kpi-1',
        indicator: 'Solicitações registradas',
        objective: 'Volume total captado na plataforma',
        target: 'Monitoramento contínuo',
        result: metrics.totalRegistered.toLocaleString('pt-BR'),
        status: 'em acompanhamento',
      },
      {
        id: 'kpi-2',
        indicator: 'Com localização identificada',
        objective: 'Garantir georreferenciamento para despacho de equipe',
        target: '≥ 90%',
        result: `${metrics.withLocationPct}%`,
        status: metrics.withLocationPct >= 90 ? 'atingida' : 'abaixo da meta',
      },
      {
        id: 'kpi-3',
        indicator: 'Com protocolo rastreável',
        objective: 'Assegurar direito de acompanhamento (Lei nº 13.460/2017)',
        target: '100%',
        result: `${metrics.withProtocolPct}%`,
        status: metrics.withProtocolPct >= 100 ? 'atingida' : 'abaixo da meta',
      },
      {
        id: 'kpi-4',
        indicator: 'Tempo médio de triagem',
        objective: 'Da criação até sair do estado Recebida',
        target: `≤ ${targetTriageDays.toString().replace('.', ',')} dia (−20% sobre base)`,
        result:
          metrics.avgTriageDays === null
            ? 'Sem triagens no período'
            : `${metrics.avgTriageDays.toString().replace('.', ',')} dia`,
        status:
          metrics.avgTriageDays === null
            ? 'em acompanhamento'
            : metrics.avgTriageDays <= targetTriageDays
              ? 'atingida'
              : 'abaixo da meta',
      },
      {
        id: 'kpi-5',
        indicator: 'Com atualização de status',
        objective: 'Transparência ativa no tratamento das demandas',
        target: '≥ 90%',
        result: `${metrics.withStatusUpdatePct}%`,
        status: metrics.withStatusUpdatePct >= 90 ? 'atingida' : 'abaixo da meta',
      },
      {
        id: 'kpi-6',
        indicator: 'Taxa de resolução (Concluídas / total)',
        objective: 'Evolução da capacidade resolutiva das secretarias',
        target: 'Crescente (≥ 70%)',
        result: `${metrics.resolutionRatePct}%`,
        status:
          metrics.resolutionRatePct >= 70 ? 'atingida' : 'em acompanhamento',
      },
      {
        id: 'kpi-7',
        indicator: 'Satisfação do cidadão',
        objective: 'Avaliações positivas (4 ou 5 estrelas) nas concluídas',
        target: '≥ 80% positivas',
        result:
          metrics.satisfactionPct === null
            ? 'Sem avaliações'
            : `${metrics.satisfactionPct}%`,
        status:
          metrics.satisfactionPct === null
            ? 'em acompanhamento'
            : metrics.satisfactionPct >= 80
              ? 'atingida'
              : 'abaixo da meta',
      },
      {
        id: 'kpi-8',
        indicator: 'Duplicidades identificadas',
        objective: 'Agrupamento automático de relatos próximos (≤ 50m)',
        target: 'Identificação ativa',
        result: `${metrics.duplicatesIdentified} agrupadas`,
        status: metrics.duplicatesIdentified > 0 ? 'atingida' : 'em acompanhamento',
      },
    ];
  }

  async getKpisFromDb(user?: AuthenticatedUser): Promise<KpiRow[]> {
    const dash = await this.getAdminDashboard(user);
    const sc = this.scope(user);
    const locRes = await this.db.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.location IS NOT NULL)::int AS with_location,
          COUNT(*) FILTER (WHERE o.protocol IS NOT NULL AND o.protocol <> '')::int AS with_protocol,
          COUNT(*) FILTER (WHERE o.status <> 'received')::int AS with_update
       FROM occurrences o
       ${sc.where}`,
      sc.params,
    );

    const row = locRes.rows[0];
    const pct = (part: number) =>
      row.total > 0 ? Math.round((part / row.total) * 100) : 0;

    return this.evaluateKpiMetrics({
      totalRegistered: dash.kpis.total,
      withLocationPct: pct(row.with_location),
      withProtocolPct: pct(row.with_protocol),
      avgTriageDays: dash.kpis.avgTriageDays,
      baselineTriageDays: TRIAGE_BASELINE_DAYS,
      withStatusUpdatePct: pct(row.with_update),
      resolutionRatePct: pct(dash.kpis.done),
      satisfactionPct: dash.kpis.satisfactionPct,
      duplicatesIdentified: dash.kpis.duplicates,
    });
  }

  async getReportPeriod(user?: AuthenticatedUser): Promise<string> {
    const sc = this.scope(user);
    const res = await this.db.query(
      `SELECT MIN(o.created_at) AS first_at, MAX(o.created_at) AS last_at
       FROM occurrences o ${sc.where}`,
      sc.params,
    );
    return formatPeriod(res.rows[0]?.first_at, res.rows[0]?.last_at);
  }

  async getMonthlyReport(user?: AuthenticatedUser) {
    const sc = this.scope(user);
    const res = await this.db.query(
      `SELECT
          to_char(date_trunc('month', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS ym,
          COUNT(*)::int AS registered,
          COUNT(*) FILTER (WHERE o.status = 'done')::int AS resolved,
          COUNT(*) FILTER (WHERE o.status = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE o.status NOT IN ('done', 'rejected'))::int AS open
       FROM occurrences o
       ${sc.where}
       GROUP BY 1
       ORDER BY 1 ASC`,
      sc.params,
    );
    return res.rows.map((r) => {
      const [year, month] = String(r.ym).split('-');
      return {
        month: `${MONTH_FULL[Number(month) - 1]}/${year}`,
        registered: r.registered,
        resolved: r.resolved,
        rejected: r.rejected,
        open: r.open,
      };
    });
  }

  async getByDepartmentReport(user?: AuthenticatedUser) {
    const res = await this.db.query(
      `SELECT d.name AS department,
              COUNT(o.id)::int AS "totalDemands",
              COUNT(o.id) FILTER (WHERE o.status = 'done')::int AS resolved,
              COUNT(o.id) FILTER (WHERE o.status NOT IN ('done', 'rejected'))::int AS open,
              ROUND(
                (AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 86400.0)
                  FILTER (WHERE o.status = 'done' AND o.closed_at IS NOT NULL))::numeric,
                1
              )::float AS "avgResolutionDays",
              COUNT(o.id) FILTER (
                WHERE o.status = 'done' AND o.closed_at IS NOT NULL
                  AND o.closed_at <= o.execution_due_at
              )::int AS on_time
       FROM departments d
       LEFT JOIN occurrences o ON o.department_id = d.id
       ${user?.role === UserRole.DEPARTMENT ? 'WHERE d.id = $1' : 'WHERE d.active = TRUE OR o.id IS NOT NULL'}
       GROUP BY d.id
       ORDER BY "totalDemands" DESC, department ASC`,
      this.scope(user).params,
    );
    return res.rows.map(({ on_time, ...r }) => ({
      ...r,
      deadlineCompliancePct:
        r.resolved > 0 ? Math.round((on_time / r.resolved) * 100) : null,
    }));
  }

  async getRecurringByNeighborhoodReport(user?: AuthenticatedUser) {
    const sc = this.scope(user);
    const res = await this.db.query(
      `SELECT o.neighborhood,
              c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE o.status NOT IN ('done', 'rejected'))::int AS open
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${sc.where}
       GROUP BY o.neighborhood, c.id
       ORDER BY count DESC, o.neighborhood ASC, c.name ASC`,
      sc.params,
    );
    return res.rows;
  }

  formatCsv(rows: Record<string, any>[], columns: ReportColumn[]): string {
    return toCsv(rows, columns);
  }

  /**
   * Gera um PDF textual simples e válido (A4, Helvetica/WinAnsi, múltiplas páginas),
   * com tabela de referência cruzada calculada a partir dos offsets reais.
   */
  buildSimplePdfBuffer(
    title: string,
    period: string,
    rows: Record<string, any>[],
    columns: ReportColumn[],
  ): Buffer {
    const textLines = [
      `CIDADE EM FOCO - ${title.toUpperCase()}`,
      `Período: ${period}`,
      `Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      '',
      ...(rows.length === 0 ? ['Nenhum registro no período.'] : []),
      ...rows.map((r) =>
        columns.map((c) => `${c.label}: ${r[c.key] ?? '-'}`).join('  |  '),
      ),
    ].flatMap((line) => wrapLine(line, 105));

    const LINES_PER_PAGE = 48;
    const pages: string[][] = [];
    for (let i = 0; i < textLines.length; i += LINES_PER_PAGE) {
      pages.push(textLines.slice(i, i + LINES_PER_PAGE));
    }
    if (pages.length === 0) pages.push(['']);

    const escapePdf = (line: string) =>
      line
        // Helvetica padrão só cobre WinAnsi: troca o que estiver fora por "?"
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
        .replace(/([\\()])/g, '\\$1');

    const objects: Buffer[] = [];
    const fontObj = 3;
    const firstPageObj = 4;
    const pageObjNums = pages.map((_, i) => firstPageObj + i * 2);

    objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
    objects[2] = Buffer.from(
      `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,
      'latin1',
    );
    objects[fontObj] = Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      'latin1',
    );

    pages.forEach((lines, i) => {
      const pageNum = pageObjNums[i];
      const contentNum = pageNum + 1;
      const stream = Buffer.from(
        `BT\n/F1 9 Tf\n14 TL\n40 800 Td\n${lines
          .map((l) => `(${escapePdf(l)}) Tj T*`)
          .join('\n')}\nET`,
        'latin1',
      );
      objects[pageNum] = Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentNum} 0 R >>`,
        'latin1',
      );
      objects[contentNum] = Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
        stream,
        Buffer.from('\nendstream', 'latin1'),
      ]);
    });

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    const offsets: number[] = [];
    let position = chunks[0].length;
    for (let n = 1; n < objects.length; n++) {
      const body = Buffer.concat([
        Buffer.from(`${n} 0 obj\n`, 'latin1'),
        objects[n],
        Buffer.from('\nendobj\n', 'latin1'),
      ]);
      offsets[n] = position;
      position += body.length;
      chunks.push(body);
    }

    const xref =
      `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
      offsets
        .slice(1)
        .map((off) => `${String(off).padStart(10, '0')} 00000 n \n`)
        .join('') +
      `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
    chunks.push(Buffer.from(xref, 'latin1'));

    return Buffer.concat(chunks);
  }
}

function wrapLine(line: string, max: number): string[] {
  if (line.length <= max) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = '    ' + rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

@ApiTags('Administração — Dashboard, Indicadores e Relatórios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRIAGE, UserRole.DEPARTMENT, UserRole.MANAGER, UserRole.ADMIN)
@Controller('admin')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'KPIs do Dashboard calculados no banco (total, pendentes, em andamento, concluídas, não procedentes, triagem, satisfação, duplicidades, problemas recorrentes, clusters e demandas por departamento)',
  })
  async getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getAdminDashboard(user);
  }

  @Get('kpis')
  @ApiOperation({
    summary: 'Tabela dos 8 indicadores e metas iniciais calculados no banco (Regra 12)',
  })
  async getKpis(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getKpisFromDb(user);
  }

  @Get('reports/monthly')
  @ApiOperation({ summary: 'Relatório de desempenho mensal (?format=csv ou pdf para exportar)' })
  async getMonthlyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.reportsService.getMonthlyReport(user);
    return this.handleReportFormat(
      'Desempenho Mensal',
      'desempenho-mensal',
      rows,
      REPORT_COLUMNS.monthly,
      format,
      res,
      user,
    );
  }

  @Get('reports/by-department')
  @ApiOperation({ summary: 'Relatório de demandas por departamento (?format=csv ou pdf)' })
  async getByDepartmentReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.reportsService.getByDepartmentReport(user);
    return this.handleReportFormat(
      'Demandas por Departamento',
      'demandas-por-departamento',
      rows,
      REPORT_COLUMNS.byDepartment,
      format,
      res,
      user,
    );
  }

  @Get('reports/recurring-by-neighborhood')
  @ApiOperation({ summary: 'Relatório de problemas recorrentes por bairro (?format=csv ou pdf)' })
  async getRecurringReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.reportsService.getRecurringByNeighborhoodReport(user);
    return this.handleReportFormat(
      'Problemas Recorrentes por Bairro',
      'problemas-recorrentes-por-bairro',
      rows,
      REPORT_COLUMNS.recurring,
      format,
      res,
      user,
    );
  }

  private async handleReportFormat(
    title: string,
    fileSlug: string,
    rows: Record<string, any>[],
    columns: ReportColumn[],
    format: string | undefined,
    res: Response,
    user: AuthenticatedUser,
  ) {
    const period = await this.reportsService.getReportPeriod(user);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="relatorio-${fileSlug}.csv"`,
      );
      return this.reportsService.formatCsv(rows, columns);
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="relatorio-${fileSlug}.pdf"`,
      );
      return new StreamableFile(
        this.reportsService.buildSimplePdfBuffer(title, period, rows, columns),
      );
    }
    return { title, period, columns, items: rows };
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
