import { Global, Injectable, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface RecordAuditParams {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async log(params: RecordAuditParams): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, before, after, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.actorId ?? null,
        params.action,
        params.entity,
        params.entityId,
        params.before ? JSON.stringify(params.before) : null,
        params.after ? JSON.stringify(params.after) : null,
        params.ip ?? null,
      ],
    );
  }

  async findAll(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs`,
    );
    const rowsRes = await this.db.query(
      `SELECT a.id, a.actor_id AS "actorId", u.name AS "actorName", u.role AS "actorRole",
              a.action, a.entity, a.entity_id AS "entityId",
              a.before, a.after, a.ip, a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );

    return {
      items: rowsRes.rows,
      total: countRes.rows[0].total,
      page,
      pageSize,
    };
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
