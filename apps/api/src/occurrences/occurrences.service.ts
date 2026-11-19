import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateOccurrenceSchema,
  OccurrencePriority,
  OccurrenceStatus,
  UserRole,
} from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { PhotosService } from '../photos/photos.module';
import { decryptContact, encryptContact } from '../common/crypto/contact-crypto';
import { escapeLike, isUuid } from '../common/config';
import { AuthenticatedUser } from '../common/decorators/auth.decorators';

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly photosService: PhotosService,
  ) {}

  /**
   * Regra 4: Validação de transição de estado.
   * Reabrir Concluída ou Não procedente é restrito a Gestor ou Administrador.
   * Não procedente exige justificativa obrigatória.
   */
  public validateStatusTransition(params: {
    fromStatus: OccurrenceStatus;
    toStatus: OccurrenceStatus;
    actorRole: UserRole;
    justification?: string | null;
  }): void {
    const { fromStatus, toStatus, actorRole, justification } = params;

    if (
      (fromStatus === OccurrenceStatus.DONE ||
        fromStatus === OccurrenceStatus.REJECTED) &&
      fromStatus !== toStatus &&
      actorRole !== UserRole.MANAGER &&
      actorRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException({
        code: 'REOPEN_RESTRICTED_TO_MANAGER',
        message:
          'Solicitações Concluídas ou Não procedentes só podem ser reabertas por Gestor ou Administrador.',
      });
    }

    if (
      toStatus === OccurrenceStatus.REJECTED &&
      (!justification || justification.trim().length < 5)
    ) {
      throw new BadRequestException({
        code: 'JUSTIFICATION_REQUIRED_FOR_REJECTED',
        message:
          'Para Não procedente, a justificativa é obrigatória e fica visível ao cidadão.',
      });
    }
  }

  async createOccurrence(params: {
    rawBody: unknown;
    files?: Express.Multer.File[];
    requesterUser?: AuthenticatedUser;
    assistedByUserId?: string | null;
  }) {
    const dto = CreateOccurrenceSchema.parse(params.rawBody);
    const processedPhotos = await this.photosService.processAndStorePhotos(
      params.files || [],
    );

    return this.db.withTransaction(async (client) => {
      // 1. Consulta categoria e prazos do departamento responsável (Regra 3)
      const catRes = await client.query(
        `SELECT c.id, c.name, c.slug, c.department_id, c.execution_deadline_days,
                d.response_deadline_days
         FROM categories c
         JOIN departments d ON d.id = c.department_id
         WHERE c.id = $1 AND c.active = TRUE`,
        [dto.categoryId],
      );
      const category = catRes.rows[0];
      if (!category) {
        throw new BadRequestException({
          code: 'INVALID_CATEGORY',
          message: 'A categoria selecionada não existe ou está inativa.',
        });
      }

      // 2. Gera protocolo atômico CF-AAAA-NNNNNN com lock de linha (Regra 1)
      const currentYear = new Date().getFullYear();
      const counterRes = await client.query(
        `INSERT INTO protocol_counters (year, last_value)
         VALUES ($1, 1)
         ON CONFLICT (year)
         DO UPDATE SET last_value = protocol_counters.last_value + 1
         RETURNING last_value`,
        [currentYear],
      );
      const nextSeq = counterRes.rows[0].last_value;
      const protocol = `CF-${currentYear}-${String(nextSeq).padStart(6, '0')}`;

      // 3. Procura duplicidades abertas na mesma categoria a até 50m e similaridade >= 0.3 (Regra 5)
      const isShortDesc = dto.description.trim().length < 25;
      const dupRes = await client.query(
        `SELECT id, group_id, created_at
         FROM occurrences
         WHERE category_id = $1
           AND status NOT IN ('done', 'rejected')
           AND ST_DWithin(
             location,
             ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
             50
           )
           AND ($4::boolean = TRUE OR similarity(description, $5) >= 0.3)
         ORDER BY created_at ASC
         LIMIT 1`,
        [
          category.id,
          dto.longitude,
          dto.latitude,
          isShortDesc,
          dto.description.trim(),
        ],
      );

      let groupId: string | null = null;
      let isGroupMain = true;
      let priority = OccurrencePriority.MEDIUM;

      if (dupRes.rows.length > 0) {
        const match = dupRes.rows[0];
        isGroupMain = false;

        if (match.group_id) {
          groupId = match.group_id;
        } else {
          const newGroupRes = await client.query(
            `INSERT INTO occurrence_groups (main_occurrence_id)
             VALUES ($1) RETURNING id`,
            [match.id],
          );
          groupId = newGroupRes.rows[0].id;
          await client.query(
            `UPDATE occurrences SET group_id = $1, is_group_main = TRUE WHERE id = $2`,
            [groupId, match.id],
          );
        }

        // Regra 8: 5 ou mais relatos semelhantes sugerem prioridade Alta
        const countGroupRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM occurrences WHERE group_id = $1`,
          [groupId],
        );
        if (countGroupRes.rows[0].cnt + 1 >= 5) {
          priority = OccurrencePriority.HIGH;
          await client.query(
            `UPDATE occurrences SET priority = 'alta' WHERE group_id = $1`,
            [groupId],
          );
        }
      }

      const now = new Date();
      const responseDueAt = new Date(
        now.getTime() + category.response_deadline_days * 24 * 60 * 60 * 1000,
      );
      const executionDueAt = new Date(
        now.getTime() + category.execution_deadline_days * 24 * 60 * 60 * 1000,
      );

      const autoTitle =
        dto.title?.trim() ||
        `${category.name} — ${dto.description.trim().slice(0, 65)}`;

      const encryptedContact = encryptContact(dto.requesterContact);

      const occRes = await client.query(
        `INSERT INTO occurrences (
          protocol, category_id, title, description, reference_point,
          address_text, neighborhood, location, status, priority,
          department_id, requester_id, requester_name, requester_contact,
          group_id, is_group_main, assisted_by_user_id,
          response_due_at, execution_due_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, 'received', $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19
        ) RETURNING id, protocol, status, priority, created_at AS "createdAt"`,
        [
          protocol,
          category.id,
          autoTitle,
          dto.description.trim(),
          dto.referencePoint?.trim() || null,
          dto.addressText.trim(),
          dto.neighborhood.trim(),
          dto.longitude,
          dto.latitude,
          priority,
          category.department_id,
          params.requesterUser?.id || null,
          dto.requesterName?.trim() || params.requesterUser?.name || null,
          encryptedContact,
          groupId,
          isGroupMain,
          params.assistedByUserId || null,
          responseDueAt.toISOString(),
          executionDueAt.toISOString(),
        ],
      );

      const created = occRes.rows[0];

      // Salva fotos associadas
      for (let idx = 0; idx < processedPhotos.length; idx++) {
        const photo = processedPhotos[idx];
        await client.query(
          `INSERT INTO occurrence_photos (occurrence_id, storage_key, thumb_key, position)
           VALUES ($1, $2, $3, $4)`,
          [created.id, photo.storageKey, photo.thumbKey, idx],
        );
      }

      // Grava histórico inicial visível ao cidadão
      await client.query(
        `INSERT INTO status_history (
          occurrence_id, from_status, to_status, justification, actor_id, visible_to_citizen
        ) VALUES ($1, NULL, 'received', $2, $3, TRUE)`,
        [
          created.id,
          groupId
            ? 'Solicitação registrada e associada a outros relatos semelhantes na mesma área.'
            : 'Solicitação registrada na plataforma Cidade em Foco.',
          params.requesterUser?.id || params.assistedByUserId || null,
        ],
      );

      return {
        id: created.id,
        protocol: created.protocol,
        status: created.status,
        priority: created.priority,
        categoryName: category.name,
        neighborhood: dto.neighborhood.trim(),
        addressText: dto.addressText.trim(),
        groupedWithSimilar: Boolean(groupId),
        createdAt: created.createdAt,
      };
    });
  }

  /**
   * Consulta pública por protocolo (sem login, sem dados pessoais do solicitante)
   */
  async findByProtocolPublic(protocol: string, viewer?: AuthenticatedUser) {
    const cleanProtocol = protocol.trim().toUpperCase();
    const res = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.description,
              o.reference_point AS "referencePoint",
              o.address_text AS "addressText",
              o.neighborhood,
              ROUND(ST_Y(o.location::geometry)::numeric, 3)::float AS latitude,
              ROUND(ST_X(o.location::geometry)::numeric, 3)::float AS longitude,
              o.status, o.priority,
              o.group_id AS "groupId",
              o.requester_id AS "requesterId",
              o.created_at AS "createdAt",
              o.closed_at AS "closedAt",
              c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              d.name AS "departmentName"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       WHERE UPPER(o.protocol) = $1`,
      [cleanProtocol],
    );

    const occ = res.rows[0];
    if (!occ) {
      throw new NotFoundException({
        code: 'PROTOCOL_NOT_FOUND',
        message: `Nenhuma solicitação encontrada para o protocolo ${cleanProtocol}.`,
      });
    }

    return this.toPublicDetail(occ, viewer);
  }

  /**
   * Remove qualquer dado pessoal e informa ao cliente se quem consulta é o dono
   * e se pode avaliar o atendimento.
   */
  private async toPublicDetail(occ: any, viewer?: AuthenticatedUser) {
    const enriched = await this.enrichOccurrenceDetails(occ);
    const requesterId: string | null = enriched.requesterId ?? null;
    const isMine = Boolean(viewer?.id && requesterId && viewer.id === requesterId);
    const canRate =
      enriched.status === OccurrenceStatus.DONE &&
      !enriched.rating &&
      (requesterId === null || isMine);

    delete enriched.requesterId;
    delete enriched.requesterName;
    delete enriched.requesterContact;
    delete enriched.assistedByName;
    return { ...enriched, isMine, canRate };
  }

  async findOccurrenceById(
    id: string,
    viewer?: AuthenticatedUser,
    options: { includeRequester?: boolean } = {},
  ) {
    if (!isUuid(id)) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }
    const res = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.description,
              o.reference_point AS "referencePoint",
              o.address_text AS "addressText",
              o.neighborhood,
              ROUND(ST_Y(o.location::geometry)::numeric, 4)::float AS latitude,
              ROUND(ST_X(o.location::geometry)::numeric, 4)::float AS longitude,
              o.status, o.priority,
              o.group_id AS "groupId",
              o.requester_id AS "requesterId",
              COALESCE(o.requester_name, ru.name) AS "requesterName",
              o.requester_contact AS "requesterContact",
              ru.email AS "requesterEmail",
              au.name AS "assistedByName",
              o.response_due_at AS "responseDueAt",
              o.execution_due_at AS "executionDueAt",
              o.created_at AS "createdAt",
              o.closed_at AS "closedAt",
              c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon",
              d.id AS "departmentId", d.name AS "departmentName"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       JOIN departments d ON d.id = o.department_id
       LEFT JOIN users ru ON ru.id = o.requester_id
       LEFT JOIN users au ON au.id = o.assisted_by_user_id
       WHERE o.id = $1`,
      [id],
    );

    const occ = res.rows[0];
    if (!occ) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }

    const requesterEmail: string | null = occ.requesterEmail ?? null;
    delete occ.requesterEmail;

    if (options.includeRequester) {
      // Visão administrativa: dados do solicitante ficam disponíveis apenas a servidores autenticados
      const enriched = await this.enrichOccurrenceDetails(occ);
      const contact =
        decryptContact(enriched.requesterContact) || requesterEmail || null;
      delete enriched.requesterId;
      return {
        ...enriched,
        requesterContact: contact,
        hasAccount: Boolean(occ.requesterId),
      };
    }

    return this.toPublicDetail(occ, viewer);
  }

  private async enrichOccurrenceDetails(occ: any) {
    const photosRes = await this.db.query(
      `SELECT id, storage_key AS "storageKey", thumb_key AS "thumbKey", position
       FROM occurrence_photos
       WHERE occurrence_id = $1
       ORDER BY position ASC`,
      [occ.id],
    );

    const historyRes = await this.db.query(
      `SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus",
              h.justification, h.created_at AS "createdAt",
              COALESCE(d.name, 'Atendimento Municipal') AS "actorName"
       FROM status_history h
       LEFT JOIN users u ON u.id = h.actor_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE h.occurrence_id = $1 AND h.visible_to_citizen = TRUE
       ORDER BY h.created_at ASC`,
      [occ.id],
    );

    const ratingRes = await this.db.query(
      `SELECT id, stars, comment, created_at AS "createdAt"
       FROM ratings WHERE occurrence_id = $1`,
      [occ.id],
    );

    let similarCount = 0;
    let similarProtocols: Array<{ id: string; protocol: string; createdAt: string }> = [];
    if (occ.groupId) {
      const simRes = await this.db.query(
        `SELECT id, protocol, created_at AS "createdAt"
         FROM occurrences
         WHERE group_id = $1 AND id <> $2
         ORDER BY created_at ASC`,
        [occ.groupId, occ.id],
      );
      similarCount = simRes.rows.length;
      similarProtocols = simRes.rows;
    }

    return {
      ...occ,
      photos: photosRes.rows.map((p) => ({
        ...p,
        url: this.photosService.getPublicPhotoUrl(p.storageKey),
        thumbUrl: this.photosService.getPublicPhotoUrl(p.thumbKey),
      })),
      history: historyRes.rows,
      rating: ratingRes.rows[0] || null,
      similarCount,
      similarProtocols,
    };
  }

  async findMyOccurrences(params: {
    userId: string;
    statusFilter?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['o.requester_id = $1'];
    const values: any[] = [params.userId];
    let idx = 2;

    if (params.statusFilter === 'open') {
      conditions.push(`o.status NOT IN ('done', 'rejected')`);
    } else if (params.statusFilter === 'done') {
      conditions.push(`o.status = 'done'`);
    } else if (params.statusFilter === 'rejected') {
      conditions.push(`o.status = 'rejected'`);
    } else if (params.statusFilter && params.statusFilter !== 'all') {
      conditions.push(`o.status = $${idx++}`);
      values.push(params.statusFilter);
    }

    if (params.q && params.q.trim()) {
      conditions.push(
        `(o.protocol ILIKE $${idx} OR o.title ILIKE $${idx} OR o.address_text ILIKE $${idx})`,
      );
      values.push(`%${escapeLike(params.q.trim())}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM occurrences o WHERE ${whereClause}`,
      values,
    );

    const rowsRes = await this.db.query(
      `SELECT o.id, o.protocol, o.title, o.address_text AS "addressText",
              o.neighborhood, o.status, o.priority, o.created_at AS "createdAt",
              c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug", c.icon AS "categoryIcon"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    );

    return {
      items: rowsRes.rows,
      total: countRes.rows[0].total,
      page,
      pageSize,
    };
  }

  /**
   * Mapa público anonimizado (Regra 11: retorna apenas categoria, estado, bairro e coordenadas arredondadas em 3 casas)
   */
  async findPublicMapOccurrences(params: {
    bbox?: string;
    category?: string;
    status?: string;
    neighborhood?: string;
    lat?: number;
    lng?: number;
    limit?: number;
  }) {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.category) {
      conditions.push(`(c.slug = $${idx} OR c.id::text = $${idx})`);
      values.push(params.category);
      idx++;
    }

    if (params.status === 'open') {
      conditions.push(`o.status NOT IN ('done', 'rejected')`);
    } else if (params.status) {
      conditions.push(`o.status = $${idx++}`);
      values.push(params.status);
    }

    if (params.neighborhood) {
      conditions.push(`LOWER(o.neighborhood) = LOWER($${idx++})`);
      values.push(params.neighborhood.trim());
    }

    if (params.bbox) {
      const parts = params.bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        conditions.push(
          `o.location::geometry && ST_MakeEnvelope($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, 4326)`,
        );
        values.push(minLng, minLat, maxLng, maxLat);
        idx += 4;
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = Math.min(250, Math.max(1, Number(params.limit || 200)));

    const rowsRes = await this.db.query(
      `SELECT o.id,
              o.protocol,
              o.title,
              c.id AS "categoryId",
              c.name AS "categoryName",
              c.slug AS "categorySlug",
              c.icon AS "categoryIcon",
              o.status,
              o.neighborhood,
              ROUND(ST_Y(o.location::geometry)::numeric, 3)::float AS latitude,
              ROUND(ST_X(o.location::geometry)::numeric, 3)::float AS longitude,
              o.created_at AS "createdAt"
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${idx}`,
      [...values, limit],
    );

    // Agrupamentos (clusters por bairro) para visualização rápida no mapa
    const clustersRes = await this.db.query(
      `SELECT o.neighborhood,
              COUNT(*)::int AS count,
              ROUND(AVG(ST_Y(o.location::geometry))::numeric, 3)::float AS latitude,
              ROUND(AVG(ST_X(o.location::geometry))::numeric, 3)::float AS longitude
       FROM occurrences o
       JOIN categories c ON c.id = o.category_id
       ${whereClause}
       GROUP BY o.neighborhood
       ORDER BY count DESC`,
      values,
    );

    return {
      points: rowsRes.rows,
      clusters: clustersRes.rows,
    };
  }
}
