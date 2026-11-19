import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OccurrencePriority,
  OccurrenceStatus,
  UpdateOccurrenceAdminSchema,
  UserRole,
} from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.module';
import { NotificationsService } from '../notifications/notifications.module';
import { OccurrencesService } from './occurrences.service';
import { AuthenticatedUser } from '../common/decorators/auth.decorators';
import { escapeLike, isUuid } from '../common/config';

@Injectable()
export class AdminOccurrencesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly occurrencesService: OccurrencesService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async listAdminOccurrences(params: {
    user: AuthenticatedUser;
    q?: string;
    status?: string;
    category?: string;
    departmentId?: string;
    priority?: string;
    neighborhood?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 8)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Regra 9: Escopo por perfil — Departamento vê apenas as do próprio departamento
    if (params.user.role === UserRole.DEPARTMENT && params.user.departmentId) {
      conditions.push(`o.department_id = $${idx++}`);
      values.push(params.user.departmentId);
    } else if (params.departmentId) {
      conditions.push(`o.department_id = $${idx++}`);
      values.push(params.departmentId);
    }

    if (params.status === 'open') {
      conditions.push(`o.status NOT IN ('done', 'rejected')`);
    } else if (params.status) {
      conditions.push(`o.status = $${idx++}`);
      values.push(params.status);
    }

    if (params.category) {
      conditions.push(`(c.slug = $${idx} OR c.id::text = $${idx})`);
      values.push(params.category);
      idx++;
    }

    if (params.priority) {
      conditions.push(`o.priority = $${idx++}`);
      values.push(params.priority);
    }

    if (params.neighborhood) {
      conditions.push(`LOWER(o.neighborhood) = LOWER($${idx++})`);
      values.push(params.neighborhood.trim());
    }

    if (params.q && params.q.trim()) {
      conditions.push(
        `(o.protocol ILIKE $${idx} OR o.address_text ILIKE $${idx} OR o.neighborhood ILIKE $${idx} OR o.title ILIKE $${idx})`,
      );
      values.push(`%${escapeLike(params.q.trim())}%`);
      idx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.status IN ('received', 'in_review', 'forwarded'))::int AS pending,
          COUNT(*) FILTER (WHERE o.status IN ('scheduled', 'in_progress'))::int AS "inProgress"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${whereClause}`,
      values,
    );

    const rowsRes = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.address_text AS "addressText",
              o.neighborhood, o.status, o.priority,
              o.group_id AS "groupId",
              o.created_at AS "createdAt",
              c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              d.id AS "departmentId", d.name AS "departmentName",
              CASE
                WHEN o.group_id IS NOT NULL THEN (
                  SELECT GREATEST(0, COUNT(*)::int - 1)
                  FROM occurrences og
                  WHERE og.group_id = o.group_id
                )
                ELSE 0
              END AS "similarCount"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       ${whereClause}
       ORDER BY
         CASE o.priority
           WHEN 'alta' THEN 1
           WHEN 'media' THEN 2
           ELSE 3
         END ASC,
         o.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    );

    return {
      items: rowsRes.rows,
      total: countRes.rows[0].total,
      pendingCount: countRes.rows[0].pending,
      inProgressCount: countRes.rows[0].inProgress,
      page,
      pageSize,
    };
  }

  async getAdminOccurrenceDetail(id: string, user: AuthenticatedUser) {
    const detail = await this.occurrencesService.findOccurrenceById(
      id,
      undefined,
      { includeRequester: true },
    );

    if (
      user.role === UserRole.DEPARTMENT &&
      detail.departmentId !== user.departmentId
    ) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_SCOPE_RESTRICTED',
        message: 'Você só pode visualizar solicitações encaminhadas ao seu departamento.',
      });
    }

    return detail;
  }

  async updateOccurrenceAdmin(params: {
    id: string;
    rawBody: unknown;
    user: AuthenticatedUser;
    ip?: string;
  }) {
    const dto = UpdateOccurrenceAdminSchema.parse(params.rawBody);
    if (!isUuid(params.id)) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }

    const currentRes = await this.db.query(
      `SELECT id, protocol, status, priority, department_id AS "departmentId", group_id AS "groupId"
       FROM occurrences WHERE id = $1`,
      [params.id],
    );
    const current = currentRes.rows[0];
    if (!current) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }

    if (
      params.user.role === UserRole.DEPARTMENT &&
      current.departmentId !== params.user.departmentId
    ) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_SCOPE_RESTRICTED',
        message: 'Você só pode tratar solicitações do seu próprio departamento.',
      });
    }

    const nextStatus = dto.status ?? (current.status as OccurrenceStatus);
    const nextPriority = dto.priority ?? (current.priority as OccurrencePriority);
    const nextDeptId = dto.departmentId ?? current.departmentId;

    // Valida Regra 4 (Transições de estado e justificativa obrigatória para Não procedente)
    this.occurrencesService.validateStatusTransition({
      fromStatus: current.status as OccurrenceStatus,
      toStatus: nextStatus,
      actorRole: params.user.role,
      justification: dto.justification,
    });

    const justification = dto.justification?.trim() || null;
    const statusChanged = nextStatus !== current.status;
    const changed =
      statusChanged ||
      nextPriority !== current.priority ||
      nextDeptId !== current.departmentId;

    if (!changed && !justification) {
      throw new BadRequestException({
        code: 'NOTHING_TO_UPDATE',
        message:
          'Nenhuma alteração informada. Mude o estado, a prioridade, o departamento ou registre uma justificativa.',
      });
    }

    if (nextDeptId !== current.departmentId) {
      const deptRes = await this.db.query(
        `SELECT id FROM departments WHERE id = $1 AND active = TRUE`,
        [nextDeptId],
      );
      if (deptRes.rows.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_DEPARTMENT',
          message: 'O departamento selecionado não existe ou está inativo.',
        });
      }
    }

    const isClosing =
      nextStatus === OccurrenceStatus.DONE ||
      nextStatus === OccurrenceStatus.REJECTED;

    await this.db.withTransaction(async (client) => {
      // Ocorrências agrupadas como duplicidade compartilham estado, prioridade e departamento
      const scopeColumn = current.groupId ? 'group_id' : 'id';
      const scopeValue = current.groupId ?? current.id;

      const updated = await client.query(
        `UPDATE occurrences
         SET status = $1,
             priority = $2,
             department_id = $3,
             closed_at = CASE
               WHEN $4::boolean = FALSE THEN NULL
               WHEN closed_at IS NULL OR status <> $1 THEN NOW()
               ELSE closed_at
             END,
             updated_at = NOW()
         WHERE ${scopeColumn} = $5
         RETURNING id`,
        [nextStatus, nextPriority, nextDeptId, isClosing, scopeValue],
      );

      // O histórico visível ao cidadão só recebe entrada quando há mudança de estado ou mensagem
      if (statusChanged || justification) {
        for (const m of updated.rows) {
          await client.query(
            `INSERT INTO status_history (
              occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen
            ) VALUES ($1, $2, $3, $4, $5, TRUE)`,
            [m.id, current.status, nextStatus, justification, params.user.id],
          );
        }
      }
    });

    // Registra log de auditoria com antes e depois (Seção 2 e 4)
    await this.auditService.log({
      actorId: params.user.id,
      action: 'OCCURRENCE_UPDATED',
      entity: 'occurrences',
      entityId: current.id,
      before: {
        status: current.status,
        priority: current.priority,
        departmentId: current.departmentId,
      },
      after: {
        status: nextStatus,
        priority: nextPriority,
        departmentId: nextDeptId,
        justification,
      },
      ip: params.ip || null,
    });

    // Notifica os cidadãos associados ao protocolo ou grupo (Regra 6) apenas quando há algo visível para eles
    if (statusChanged || justification) {
      await this.notificationsService.notifyOccurrenceGroupStatusChange({
        occurrenceId: current.id,
        groupId: current.groupId,
        newStatus: nextStatus,
        statusChanged,
        justification,
      });
    }

    return this.getAdminOccurrenceDetail(current.id, params.user);
  }

  async manageDuplicateGroup(params: {
    occurrenceId: string;
    targetProtocol?: string;
    action: 'link' | 'unlink';
    user: AuthenticatedUser;
    ip?: string;
  }) {
    const occRes = isUuid(params.occurrenceId)
      ? await this.db.query(
          `SELECT id, protocol, group_id AS "groupId", department_id AS "departmentId"
           FROM occurrences WHERE id = $1`,
          [params.occurrenceId],
        )
      : { rows: [] as any[] };
    const occ = occRes.rows[0];
    if (!occ) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }

    if (
      occ &&
      params.user.role === UserRole.DEPARTMENT &&
      occ.departmentId !== params.user.departmentId
    ) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_SCOPE_RESTRICTED',
        message: 'Você só pode tratar solicitações do seu próprio departamento.',
      });
    }

    if (params.action === 'unlink') {
      if (!occ.groupId) {
        throw new BadRequestException({
          code: 'NOT_GROUPED',
          message: 'Esta solicitação não está associada a nenhum agrupamento.',
        });
      }
      await this.db.query(
        `UPDATE occurrences SET group_id = NULL, is_group_main = TRUE, updated_at = NOW() WHERE id = $1`,
        [occ.id],
      );
      await this.auditService.log({
        actorId: params.user.id,
        action: 'OCCURRENCE_UNGROUPED',
        entity: 'occurrences',
        entityId: occ.id,
        before: { groupId: occ.groupId },
        after: { groupId: null },
        ip: params.ip,
      });
      return this.getAdminOccurrenceDetail(occ.id, params.user);
    }

    if (!params.targetProtocol) {
      throw new BadRequestException({
        code: 'MISSING_TARGET_PROTOCOL',
        message: 'Informe o protocolo que deseja associar como duplicidade.',
      });
    }

    const targetRes = await this.db.query(
      `SELECT id, protocol, group_id AS "groupId"
       FROM occurrences WHERE UPPER(protocol) = UPPER($1)`,
      [params.targetProtocol.trim()],
    );
    const target = targetRes.rows[0];
    if (!target || target.id === occ.id) {
      throw new BadRequestException({
        code: 'INVALID_TARGET_PROTOCOL',
        message: 'Protocolo alvo não encontrado ou idêntico à solicitação atual.',
      });
    }

    let groupId = occ.groupId || target.groupId;
    if (!groupId) {
      const gRes = await this.db.query(
        `INSERT INTO occurrence_groups (main_occurrence_id) VALUES ($1) RETURNING id`,
        [occ.id],
      );
      groupId = gRes.rows[0].id;
    }

    // Se o alvo já pertencia a outro grupo, os dois grupos são unificados
    await this.db.query(
      `UPDATE occurrences
       SET group_id = $1,
           is_group_main = (id = (SELECT main_occurrence_id FROM occurrence_groups WHERE id = $1)),
           updated_at = NOW()
       WHERE id IN ($2, $3) OR ($4::uuid IS NOT NULL AND group_id = $4::uuid)`,
      [
        groupId,
        occ.id,
        target.id,
        target.groupId && target.groupId !== groupId ? target.groupId : null,
      ],
    );

    await this.auditService.log({
      actorId: params.user.id,
      action: 'OCCURRENCE_GROUPED_MANUALLY',
      entity: 'occurrences',
      entityId: occ.id,
      after: { groupId, linkedProtocol: target.protocol },
      ip: params.ip,
    });

    return this.getAdminOccurrenceDetail(occ.id, params.user);
  }

  async getAdminMapData(params: {
    user: AuthenticatedUser;
    neighborhood?: string;
    category?: string;
    status?: string;
    departmentId?: string;
  }) {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.user.role === UserRole.DEPARTMENT && params.user.departmentId) {
      conditions.push(`o.department_id = $${idx++}`);
      values.push(params.user.departmentId);
    } else if (params.departmentId) {
      conditions.push(`o.department_id = $${idx++}`);
      values.push(params.departmentId);
    }

    if (params.neighborhood) {
      conditions.push(`LOWER(o.neighborhood) = LOWER($${idx++})`);
      values.push(params.neighborhood.trim());
    }

    if (params.category) {
      conditions.push(`(c.slug = $${idx} OR c.id::text = $${idx})`);
      values.push(params.category);
      idx++;
    }

    if (params.status === 'open') {
      conditions.push(`o.status NOT IN ('done', 'rejected')`);
    } else if (params.status && params.status !== 'all') {
      conditions.push(`o.status = $${idx++}`);
      values.push(params.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pointsRes = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.neighborhood, o.address_text AS "addressText",
              o.status, o.priority,
              c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              d.id AS "departmentId", d.name AS "departmentName",
              ROUND(ST_Y(o.location::geometry)::numeric, 4)::float AS latitude,
              ROUND(ST_X(o.location::geometry)::numeric, 4)::float AS longitude,
              CASE
                WHEN o.group_id IS NOT NULL THEN (
                  SELECT GREATEST(0, COUNT(*)::int - 1)
                  FROM occurrences og
                  WHERE og.group_id = o.group_id
                )
                ELSE 0
              END AS "similarCount"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT 200`,
      values,
    );

    const clustersRes = await this.db.query(
      `SELECT o.neighborhood,
              COUNT(*)::int AS count,
              ROUND(AVG(ST_Y(o.location::geometry))::numeric, 4)::float AS latitude,
              ROUND(AVG(ST_X(o.location::geometry))::numeric, 4)::float AS longitude
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${whereClause}
       GROUP BY o.neighborhood
       ORDER BY count DESC`,
      values,
    );

    return {
      points: pointsRes.rows,
      clusters: clustersRes.rows,
    };
  }
}
