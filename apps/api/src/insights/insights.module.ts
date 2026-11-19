import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators';

const OVERDUE = `(o.execution_due_at < NOW() OR (o.status = 'received' AND o.response_due_at < NOW()))`;
const DUE_SOON = `(NOT ${OVERDUE} AND (o.execution_due_at < NOW() + INTERVAL '3 days'
                   OR (o.status = 'received' AND o.response_due_at < NOW() + INTERVAL '1 day')))`;

function paging(page?: string, pageSize?: string) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

/** Avaliações do cidadão e acompanhamento de prazos. Departamento vê só o próprio departamento. */
@Injectable()
export class InsightsService {
  constructor(private readonly db: DatabaseService) {}

  private deptScope(user: AuthenticatedUser, params: any[]): string {
    if (user.role !== UserRole.DEPARTMENT) return '';
    params.push(user.departmentId ?? null);
    return `o.department_id = $${params.length}`;
  }

  async ratings(
    user: AuthenticatedUser,
    q: { stars?: string; page?: string; pageSize?: string },
  ) {
    const { page, pageSize, offset } = paging(q.page, q.pageSize);

    const scopeParams: any[] = [];
    const scope = this.deptScope(user, scopeParams);
    const summaryRes = await this.db.query(
      `SELECT COUNT(*)::int AS total,
              ROUND(AVG(r.stars)::numeric, 2)::float AS average,
              COUNT(*) FILTER (WHERE r.stars = 1)::int AS s1,
              COUNT(*) FILTER (WHERE r.stars = 2)::int AS s2,
              COUNT(*) FILTER (WHERE r.stars = 3)::int AS s3,
              COUNT(*) FILTER (WHERE r.stars = 4)::int AS s4,
              COUNT(*) FILTER (WHERE r.stars = 5)::int AS s5
       FROM ratings r JOIN occurrences o ON o.id = r.occurrence_id
       ${scope ? 'WHERE ' + scope : ''}`,
      scopeParams,
    );
    const sm = summaryRes.rows[0];

    const params: any[] = [];
    const conds: string[] = [];
    const sc = this.deptScope(user, params);
    if (sc) conds.push(sc);
    const stars = Number(q.stars);
    if (stars >= 1 && stars <= 5) {
      params.push(stars);
      conds.push(`r.stars = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM ratings r JOIN occurrences o ON o.id = r.occurrence_id ${where}`,
      params,
    );
    const rows = await this.db.query(
      `SELECT r.id, r.stars, r.comment, r.created_at AS "createdAt",
              o.id AS "occurrenceId", o.protocol, o.neighborhood,
              c.name AS "categoryName", d.name AS "departmentName"
       FROM ratings r
       JOIN occurrences o ON o.id = r.occurrence_id
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return {
      summary: {
        total: sm.total,
        average: sm.average,
        positivePct: sm.total > 0 ? Math.round(((sm.s4 + sm.s5) / sm.total) * 100) : null,
        distribution: [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: sm[`s${n}`] })),
      },
      items: rows.rows,
      total: countRes.rows[0].total,
      page,
      pageSize,
    };
  }

  async deadlines(
    user: AuthenticatedUser,
    q: { scope?: string; page?: string; pageSize?: string },
  ) {
    const { page, pageSize, offset } = paging(q.page, q.pageSize);
    const params: any[] = [];
    const sc = this.deptScope(user, params);
    const open = `o.status NOT IN ('done', 'rejected')${sc ? ' AND ' + sc : ''}`;

    const summaryRes = await this.db.query(
      `SELECT COUNT(*)::int AS open,
              COUNT(*) FILTER (WHERE o.status = 'received' AND o.response_due_at < NOW())::int AS "responseOverdue",
              COUNT(*) FILTER (WHERE o.execution_due_at < NOW())::int AS "executionOverdue",
              COUNT(*) FILTER (WHERE ${DUE_SOON})::int AS "dueSoon"
       FROM occurrences o WHERE ${open}`,
      params,
    );

    const scopeCond = q.scope === 'soon' ? DUE_SOON : OVERDUE;
    const total = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM occurrences o WHERE ${open} AND ${scopeCond}`,
      params,
    );
    const rows = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.neighborhood, o.status, o.priority,
              c.name AS "categoryName", d.name AS "departmentName",
              o.response_due_at AS "responseDueAt", o.execution_due_at AS "executionDueAt",
              (o.status = 'received' AND o.response_due_at < NOW()) AS "responseOverdue",
              (o.execution_due_at < NOW()) AS "executionOverdue",
              GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - o.execution_due_at)) / 86400))::int AS "daysLate"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       WHERE ${open} AND ${scopeCond}
       ORDER BY o.execution_due_at ASC, o.protocol ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return {
      summary: summaryRes.rows[0],
      items: rows.rows,
      total: total.rows[0].total,
      page,
      pageSize,
    };
  }
}

@ApiTags('Administração — Avaliações e Prazos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRIAGE, UserRole.DEPARTMENT, UserRole.MANAGER, UserRole.ADMIN)
@Controller('admin')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('ratings')
  @ApiOperation({ summary: 'Avaliações dos cidadãos: média, distribuição e comentários (?stars=1..5)' })
  async ratings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('stars') stars?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.insights.ratings(user, { stars, page, pageSize });
  }

  @Get('deadlines')
  @ApiOperation({ summary: 'Solicitações em aberto com prazo vencido (?scope=overdue) ou a vencer em até 3 dias (?scope=soon)' })
  async deadlines(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.insights.deadlines(user, { scope, page, pageSize });
  }
}

@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
