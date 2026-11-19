import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Ip,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.module';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators';

@Injectable()
export class DepartmentsAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async listDepartmentsWithCategories() {
    const deptsRes = await this.db.query(
      `SELECT d.id, d.name, d.response_deadline_days AS "responseDeadlineDays",
              d.active,
              COALESCE(
                json_agg(
                  json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
                ) FILTER (WHERE c.id IS NOT NULL),
                '[]'::json
              ) AS categories
       FROM departments d
       LEFT JOIN categories c ON c.department_id = d.id
       GROUP BY d.id
       ORDER BY d.name ASC`,
    );
    return deptsRes.rows;
  }

  async createDepartment(
    body: {
      name: string;
      responseDeadlineDays?: number;
      categoryIds?: string[];
    },
    actor: AuthenticatedUser,
    ip?: string,
  ) {
    if (!body.name || body.name.trim().length < 3) {
      throw new BadRequestException({
        code: 'INVALID_DEPARTMENT_NAME',
        message: 'Informe um nome válido para o departamento (mínimo 3 caracteres).',
      });
    }

    const deadline = Math.max(1, Number(body.responseDeadlineDays || 3));

    const created = await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO departments (name, response_deadline_days, active)
         VALUES ($1, $2, TRUE)
         RETURNING id, name, response_deadline_days AS "responseDeadlineDays", active`,
        [body.name.trim(), deadline],
      );
      const dept = res.rows[0];

      if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
        await client.query(
          `UPDATE categories
           SET department_id = $1, updated_at = NOW()
           WHERE id = ANY($2::uuid[])`,
          [dept.id, body.categoryIds],
        );
      }

      return dept;
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'DEPARTMENT_CREATED',
      entity: 'departments',
      entityId: created.id,
      after: { ...created, categoryIds: body.categoryIds || [] },
      ip,
    });

    return created;
  }

  async updateDepartment(
    id: string,
    body: {
      name?: string;
      responseDeadlineDays?: number;
      active?: boolean;
      categoryIds?: string[];
    },
    actor: AuthenticatedUser,
    ip?: string,
  ) {
    const existingRes = await this.db.query(
      `SELECT id, name, response_deadline_days AS "responseDeadlineDays", active
       FROM departments WHERE id = $1`,
      [id],
    );
    const before = existingRes.rows[0];
    if (!before) {
      throw new NotFoundException({
        code: 'DEPARTMENT_NOT_FOUND',
        message: 'Departamento não encontrado.',
      });
    }

    const nextName = body.name?.trim() || before.name;
    const nextDeadline =
      body.responseDeadlineDays !== undefined
        ? Math.max(1, Number(body.responseDeadlineDays))
        : before.responseDeadlineDays;
    const nextActive = body.active !== undefined ? Boolean(body.active) : before.active;

    const updated = await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE departments
         SET name = $1, response_deadline_days = $2, active = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, response_deadline_days AS "responseDeadlineDays", active`,
        [nextName, nextDeadline, nextActive, id],
      );

      if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
        await client.query(
          `UPDATE categories
           SET department_id = $1, updated_at = NOW()
           WHERE id = ANY($2::uuid[])`,
          [id, body.categoryIds],
        );
      }

      return res.rows[0];
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'DEPARTMENT_UPDATED',
      entity: 'departments',
      entityId: id,
      before,
      after: updated,
      ip,
    });

    return updated;
  }

  async listAllCategoriesAdmin() {
    const res = await this.db.query(
      `SELECT c.id, c.slug, c.name, c.icon,
              c.department_id AS "departmentId",
              d.name AS "departmentName",
              c.execution_deadline_days AS "executionDeadlineDays",
              c.active
       FROM categories c
       JOIN departments d ON d.id = c.department_id
       ORDER BY c.name ASC`,
    );
    return res.rows;
  }

  async createCategoryAdmin(
    body: {
      name: string;
      slug?: string;
      icon?: string;
      departmentId: string;
      executionDeadlineDays?: number;
    },
    actor: AuthenticatedUser,
    ip?: string,
  ) {
    if (!body.name || !body.departmentId) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY_DATA',
        message: 'Informe o nome e o departamento responsável pela categoria.',
      });
    }
    const slug =
      body.slug?.trim().toLowerCase() ||
      body.name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-');

    const res = await this.db.query(
      `INSERT INTO categories (slug, name, icon, department_id, execution_deadline_days, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, slug, name, icon, department_id AS "departmentId",
                 execution_deadline_days AS "executionDeadlineDays", active`,
      [
        slug,
        body.name.trim(),
        body.icon || 'road',
        body.departmentId,
        Math.max(1, Number(body.executionDeadlineDays || 7)),
      ],
    );

    const created = res.rows[0];
    await this.auditService.log({
      actorId: actor.id,
      action: 'CATEGORY_CREATED',
      entity: 'categories',
      entityId: created.id,
      after: created,
      ip,
    });
    return created;
  }

  async updateCategoryAdmin(
    id: string,
    body: {
      name?: string;
      departmentId?: string;
      executionDeadlineDays?: number;
      active?: boolean;
    },
    actor: AuthenticatedUser,
    ip?: string,
  ) {
    const beforeRes = await this.db.query(
      `SELECT id, slug, name, icon, department_id AS "departmentId",
              execution_deadline_days AS "executionDeadlineDays", active
       FROM categories WHERE id = $1`,
      [id],
    );
    const before = beforeRes.rows[0];
    if (!before) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada.',
      });
    }

    const nextName = body.name?.trim() || before.name;
    const nextDept = body.departmentId || before.departmentId;
    const nextExecDays =
      body.executionDeadlineDays !== undefined
        ? Math.max(1, Number(body.executionDeadlineDays))
        : before.executionDeadlineDays;
    const nextActive = body.active !== undefined ? Boolean(body.active) : before.active;

    const res = await this.db.query(
      `UPDATE categories
       SET name = $1, department_id = $2, execution_deadline_days = $3, active = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, slug, name, icon, department_id AS "departmentId",
                 execution_deadline_days AS "executionDeadlineDays", active`,
      [nextName, nextDept, nextExecDays, nextActive, id],
    );

    const after = res.rows[0];
    await this.auditService.log({
      actorId: actor.id,
      action: 'CATEGORY_UPDATED',
      entity: 'categories',
      entityId: id,
      before,
      after,
      ip,
    });
    return after;
  }
}

@ApiTags('Administração — Departamentos e Categorias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class DepartmentsAdminController {
  constructor(private readonly service: DepartmentsAdminService) {}

  @Get('departments')
  @Roles(UserRole.TRIAGE, UserRole.DEPARTMENT, UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista departamentos e categorias atendidas' })
  async listDepartments() {
    return this.service.listDepartmentsWithCategories();
  }

  @Post('departments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cria novo departamento e vincula categorias (somente Administrador)' })
  async createDepartment(
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.service.createDepartment(body, user, ip);
  }

  @Patch('departments/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edita departamento e registra auditoria (somente Administrador)' })
  async updateDepartment(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.service.updateDepartment(id, body, user, ip);
  }

  @Get('categories')
  @Roles(UserRole.TRIAGE, UserRole.DEPARTMENT, UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista todas as categorias para configuração administrativa' })
  async listCategories() {
    return this.service.listAllCategoriesAdmin();
  }

  @Post('categories')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cria nova categoria (somente Administrador)' })
  async createCategory(
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.service.createCategoryAdmin(body, user, ip);
  }

  @Patch('categories/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edita categoria (prazo, departamento ou ativa) com auditoria (somente Administrador)' })
  async updateCategory(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.service.updateCategoryAdmin(id, body, user, ip);
  }
}

@Module({
  controllers: [DepartmentsAdminController],
  providers: [DepartmentsAdminService],
  exports: [DepartmentsAdminService],
})
export class DepartmentsModule {}
