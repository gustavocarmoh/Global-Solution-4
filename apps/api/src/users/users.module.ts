import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import * as bcrypt from 'bcryptjs';
import { BadRequestException } from '@nestjs/common';
import {
  ChangePasswordSchema,
  CreateStaffUserSchema,
  STAFF_ROLES,
  UpdateStaffUserSchema,
  UpdatePreferencesSchema,
  UpdateProfileSchema,
  UserRole,
} from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { isUuid } from '../common/config';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.module';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string) {
    const res = await this.db.query(
      `SELECT id, name, email, phone, role,
              department_id AS "departmentId",
              lgpd_consent_at AS "lgpdConsentAt",
              text_size_pref AS "textSizePref",
              high_contrast_pref AS "highContrastPref",
              reduce_motion_pref AS "reduceMotionPref",
              email_notifications AS "emailNotifications",
              created_at AS "createdAt"
       FROM users WHERE id = $1`,
      [userId],
    );
    if (!res.rows[0]) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }
    return res.rows[0];
  }

  async updateProfile(userId: string, rawBody: unknown) {
    const body = UpdateProfileSchema.parse(rawBody);
    const current = await this.getProfile(userId);
    const name = body.name || current.name;
    const phone = body.phone !== undefined ? body.phone || null : current.phone;

    const res = await this.db.query(
      `UPDATE users
       SET name = $1, phone = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, phone, role,
                 department_id AS "departmentId",
                 text_size_pref AS "textSizePref",
                 high_contrast_pref AS "highContrastPref",
                 reduce_motion_pref AS "reduceMotionPref",
                 email_notifications AS "emailNotifications"`,
      [name, phone, userId],
    );
    return res.rows[0];
  }

  async getPreferences(userId: string) {
    const profile = await this.getProfile(userId);
    return {
      textSizePref: profile.textSizePref,
      highContrastPref: profile.highContrastPref,
      reduceMotionPref: profile.reduceMotionPref,
      emailNotifications: profile.emailNotifications,
    };
  }

  async updatePreferences(userId: string, rawBody: unknown) {
    const dto = UpdatePreferencesSchema.parse(rawBody);
    const current = await this.getPreferences(userId);

    const nextTextSize = dto.textSizePref ?? current.textSizePref;
    const nextHighContrast = dto.highContrastPref ?? current.highContrastPref;
    const nextReduceMotion = dto.reduceMotionPref ?? current.reduceMotionPref;
    const nextEmailNotif = dto.emailNotifications ?? current.emailNotifications;

    const res = await this.db.query(
      `UPDATE users
       SET text_size_pref = $1,
           high_contrast_pref = $2,
           reduce_motion_pref = $3,
           email_notifications = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING text_size_pref AS "textSizePref",
                 high_contrast_pref AS "highContrastPref",
                 reduce_motion_pref AS "reduceMotionPref",
                 email_notifications AS "emailNotifications"`,
      [
        nextTextSize,
        nextHighContrast,
        nextReduceMotion,
        nextEmailNotif,
        userId,
      ],
    );
    return res.rows[0];
  }

  /** Troca a própria senha. Encerra as sessões abertas: é preciso entrar de novo. */
  async changePassword(userId: string, rawBody: unknown) {
    const dto = ChangePasswordSchema.parse(rawBody);
    const res = await this.db.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
    const hash: string | undefined = res.rows[0]?.password_hash;
    if (!hash || !(await bcrypt.compare(dto.currentPassword, hash))) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'A senha atual não confere.',
      });
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'SAME_PASSWORD',
        message: 'A nova senha precisa ser diferente da atual.',
      });
    }
    await this.db.query(
      `UPDATE users SET password_hash = $1, refresh_token_hash = NULL, updated_at = NOW() WHERE id = $2`,
      [await bcrypt.hash(dto.newPassword, 10), userId],
    );
    await this.auditService.log({
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entity: 'users',
      entityId: userId,
    });
    return { message: 'Senha alterada. Entre novamente com a nova senha.' };
  }

  async exportMyData(userId: string) {
    const profile = await this.getProfile(userId);
    const occurrences = await this.db.query(
      `SELECT protocol, title, description, address_text AS "addressText",
              neighborhood, status, created_at AS "createdAt"
       FROM occurrences WHERE requester_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return {
      exportedAt: new Date().toISOString(),
      lgpdNotice:
        'Relatório de portabilidade de dados pessoais conforme Art. 18 da LGPD (Lei nº 13.709/2018).',
      profile,
      occurrences: occurrences.rows,
    };
  }

  async deleteOrAnonymizeAccount(userId: string) {
    await this.db.withTransaction(async (client) => {
      // Anonimiza ocorrências vinculadas para preservar histórico estatístico urbano sem dados pessoais
      await client.query(
        `UPDATE occurrences
         SET requester_id = NULL,
             requester_name = NULL,
             requester_contact = NULL,
             updated_at = NOW()
         WHERE requester_id = $1`,
        [userId],
      );

      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    });

    await this.auditService.log({
      actorId: null,
      action: 'LGPD_ACCOUNT_DELETED_AND_ANONYMIZED',
      entity: 'users',
      entityId: userId,
    });

    return {
      message:
        'Sua conta foi excluída e seus dados pessoais foram anonimizados conforme a LGPD.',
    };
  }
}

/** Gestão dos usuários de atendimento: criar e listar, exclusivo do Administrador. */
@Injectable()
export class StaffUsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const res = await this.db.query(
      `SELECT u.id, u.name, u.email, u.role, u.active,
              u.department_id AS "departmentId", d.name AS "departmentName",
              u.created_at AS "createdAt"
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.role = ANY($1::user_role[])
       ORDER BY u.name ASC`,
      [STAFF_ROLES],
    );
    return res.rows;
  }

  async create(rawBody: unknown, actor: AuthenticatedUser, ip?: string) {
    const dto = CreateStaffUserSchema.parse(rawBody);
    const email = dto.email.toLowerCase();

    const taken = await this.db.query(
      `SELECT 1 FROM users WHERE LOWER(email) = $1`,
      [email],
    );
    if (taken.rows.length > 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Este endereço de e-mail já está cadastrado.',
      });
    }

    let departmentId: string | null = null;
    if (dto.role === UserRole.DEPARTMENT) {
      const dept = await this.db.query(
        `SELECT id FROM departments WHERE id = $1 AND active = TRUE`,
        [dto.departmentId],
      );
      if (dept.rows.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_DEPARTMENT',
          message: 'O departamento selecionado não existe ou está inativo.',
        });
      }
      departmentId = dept.rows[0].id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const res = await this.db.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, department_id AS "departmentId", created_at AS "createdAt"`,
      [dto.name, email, passwordHash, dto.role, departmentId],
    );
    const created = res.rows[0];

    await this.auditService.log({
      actorId: actor.id,
      action: 'STAFF_USER_CREATED',
      entity: 'users',
      entityId: created.id,
      after: { name: created.name, email: created.email, role: created.role, departmentId },
      ip,
    });
    return created;
  }

  /** Edita perfil, departamento e situação (ativa/desativada) de uma conta de atendimento. */
  async update(id: string, rawBody: unknown, actor: AuthenticatedUser, ip?: string) {
    const dto = UpdateStaffUserSchema.parse(rawBody);
    const notFound = new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: 'Usuário de atendimento não encontrado.',
    });
    if (!isUuid(id)) throw notFound;

    const currentRes = await this.db.query(
      `SELECT id, name, email, role, active, department_id AS "departmentId"
       FROM users WHERE id = $1 AND role = ANY($2::user_role[])`,
      [id, STAFF_ROLES],
    );
    const current = currentRes.rows[0];
    if (!current) throw notFound;

    // Evita que o Administrador se tranque para fora do sistema
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== current.role))) {
      throw new BadRequestException({
        code: 'CANNOT_MODIFY_SELF',
        message: 'Você não pode desativar a própria conta nem alterar o próprio perfil.',
      });
    }

    const nextRole = dto.role ?? current.role;
    let nextDept: string | null = null;
    if (nextRole === UserRole.DEPARTMENT) {
      nextDept = dto.departmentId ?? current.departmentId;
      const dept = nextDept
        ? await this.db.query(`SELECT id FROM departments WHERE id = $1 AND active = TRUE`, [nextDept])
        : { rows: [] as any[] };
      if (dept.rows.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_DEPARTMENT',
          message: 'O perfil Departamento exige um departamento ativo.',
        });
      }
    }
    const nextActive = dto.active ?? current.active;

    const res = await this.db.query(
      `UPDATE users
       SET name = $1, role = $2, department_id = $3, active = $4,
           refresh_token_hash = CASE WHEN $4::boolean = FALSE OR $2::user_role <> role
                                     THEN NULL ELSE refresh_token_hash END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, role, active, department_id AS "departmentId"`,
      [dto.name ?? current.name, nextRole, nextDept, nextActive, id],
    );
    const updated = res.rows[0];

    await this.auditService.log({
      actorId: actor.id,
      action: 'STAFF_USER_UPDATED',
      entity: 'users',
      entityId: id,
      before: { name: current.name, role: current.role, active: current.active, departmentId: current.departmentId },
      after: { name: updated.name, role: updated.role, active: updated.active, departmentId: updated.departmentId },
      ip,
    });
    return updated;
  }
}

@ApiTags('Administração — Usuários de Atendimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class StaffUsersController {
  constructor(private readonly staffUsers: StaffUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os usuários de atendimento (somente Administrador)' })
  async list() {
    return this.staffUsers.list();
  }

  @Post()
  @ApiOperation({ summary: 'Cria usuário de atendimento com perfil e senha inicial (somente Administrador)' })
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.staffUsers.create(body, user, ip);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita perfil, departamento ou situação (ativa/desativada) do usuário de atendimento' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.staffUsers.update(id, body, user, ip);
  }
}

@ApiTags('Conta e Preferências (LGPD & Acessibilidade)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Retorna perfil do usuário autenticado' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Atualiza nome e telefone da conta' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Consulta preferências de acessibilidade e notificações' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Atualiza tamanho da fonte, alto contraste e redução de movimento' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.usersService.updatePreferences(user.id, body);
  }

  @Post('password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Troca a própria senha (exige a senha atual) e encerra as sessões abertas' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.usersService.changePassword(user.id, body);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporta todos os dados pessoais titulares (LGPD)' })
  async exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.exportMyData(user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Exclui a conta e anonimiza solicitações associadas (LGPD)' })
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.deleteOrAnonymizeAccount(user.id);
  }
}

@Module({
  controllers: [UsersController, StaffUsersController],
  providers: [UsersService, StaffUsersService],
  exports: [UsersService],
})
export class UsersModule {}
