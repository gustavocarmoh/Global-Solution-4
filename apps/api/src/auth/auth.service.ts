import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  ForgotPasswordSchema,
  LoginSchema,
  ResetPasswordSchema,
  RegisterCitizenSchema,
  UserRole,
} from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.module';
import { config } from '../common/config';
import { sendMail } from '../common/mailer';

const RESET_TOKEN_TTL_MINUTES = 30;
const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

/**
 * O refresh token é um JWT de alta entropia: SHA-256 é suficiente e, ao contrário do
 * bcrypt (que só considera os 72 primeiros bytes), cobre o token inteiro.
 */
function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  private async generateTokens(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    department_id?: string | null;
  }, sessionStart = Math.floor(Date.now() / 1000)) {
    // A sessão tem duração absoluta: renovar o token não a estende além de SESSION_MAX_HOURS
    const remaining = sessionStart + config.sessionMaxSeconds - Math.floor(Date.now() / 1000);
    if (remaining <= 0) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Sua sessão expirou. Entre novamente.',
      });
    }
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      departmentId: user.department_id ?? null,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: config.jwtAccessSecret,
      expiresIn: Math.min(config.accessTtlSeconds, remaining),
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: crypto.randomUUID(), sessionStart },
      {
        secret: config.jwtRefreshSecret,
        expiresIn: remaining,
      },
    );

    const refreshHash = hashRefreshToken(refreshToken);
    await this.db.query(
      `UPDATE users SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`,
      [refreshHash, user.id],
    );

    return { accessToken, refreshToken };
  }

  async registerCitizen(rawBody: unknown) {
    const dto = RegisterCitizenSchema.parse(rawBody);
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.db.query(
      `SELECT id FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Este endereço de e-mail já está cadastrado.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const res = await this.db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, lgpd_consent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, email, phone, role, department_id,
                 text_size_pref AS "textSizePref",
                 high_contrast_pref AS "highContrastPref",
                 reduce_motion_pref AS "reduceMotionPref",
                 email_notifications AS "emailNotifications"`,
      [
        dto.name.trim(),
        normalizedEmail,
        dto.phone?.trim() || null,
        passwordHash,
        UserRole.CITIZEN,
      ],
    );

    const user = res.rows[0];
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  /** Conta desativada pelo Administrador: a senha estava certa, mas o acesso está bloqueado. */
  private assertActive(user: { active?: boolean }) {
    if (user.active === false) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Esta conta está desativada. Procure o Administrador.',
      });
    }
  }

  async loginCitizen(rawBody: unknown) {
    const dto = LoginSchema.parse(rawBody);
    const normalizedEmail = dto.email.trim().toLowerCase();

    const res = await this.db.query(
      `SELECT id, name, email, phone, password_hash, role, department_id, active,
              text_size_pref AS "textSizePref",
              high_contrast_pref AS "highContrastPref",
              reduce_motion_pref AS "reduceMotionPref",
              email_notifications AS "emailNotifications"
       FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail],
    );

    const user = res.rows[0];
    if (!user || !user.password_hash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    this.assertActive(user);

    // Contas de atendimento entram somente pelo painel web (login institucional)
    if (user.role !== UserRole.CITIZEN) {
      throw new ForbiddenException({
        code: 'STAFF_USE_ADMIN_PANEL',
        message:
          'Contas de atendimento acessam apenas o painel administrativo web.',
      });
    }

    const tokens = await this.generateTokens(user);
    delete user.password_hash;

    return {
      user,
      ...tokens,
    };
  }

  async loginAdmin(rawBody: unknown, ip?: string) {
    // O perfil (triagem, departamento, gestor ou administrador) vem da própria conta
    const dto = LoginSchema.parse(rawBody);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const res = await this.db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.active,
              u.department_id, d.name AS "departmentName"
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE LOWER(u.email) = $1`,
      [normalizedEmail],
    );

    const user = res.rows[0];
    if (!user || !user.password_hash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    // Conta de cidadão pertence ao aplicativo: a senha estava certa, mas o painel é só do atendimento
    if (user.role === UserRole.CITIZEN) {
      throw new ForbiddenException({
        code: 'CITIZEN_USE_APP',
        message: 'Contas de cidadão acessam apenas o aplicativo.',
      });
    }

    this.assertActive(user);

    const tokens = await this.generateTokens(user);
    delete user.password_hash;

    await this.auditService.log({
      actorId: user.id,
      action: 'ADMIN_LOGIN',
      entity: 'users',
      entityId: user.id,
      after: { role: user.role, email: user.email },
      ip: ip || '127.0.0.1',
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.department_id,
        departmentName: user.departmentName,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token não informado.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: config.jwtRefreshSecret,
      });

      const res = await this.db.query(
        `SELECT id, name, email, role, department_id, active, refresh_token_hash
         FROM users WHERE id = $1`,
        [payload.sub],
      );
      const user = res.rows[0];
      if (!user || !user.refresh_token_hash || user.active === false) {
        throw new UnauthorizedException();
      }

      const presented = Buffer.from(hashRefreshToken(refreshToken));
      const stored = Buffer.from(String(user.refresh_token_hash));
      if (
        presented.length !== stored.length ||
        !crypto.timingSafeEqual(presented, stored)
      ) {
        // Token válido porém já rotacionado: possível reuso; encerra a sessão.
        await this.db.query(
          `UPDATE users SET refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
          [user.id],
        );
        throw new UnauthorizedException();
      }

      if (typeof payload.sessionStart !== 'number') {
        throw new UnauthorizedException();
      }
      return await this.generateTokens(user, payload.sessionStart);
    } catch (err) {
      const expired =
        (err as Error)?.name === 'TokenExpiredError' ||
        (err instanceof UnauthorizedException &&
          (err.getResponse() as { code?: string })?.code === 'SESSION_EXPIRED');
      if (expired) {
        // Limpa o hash para que o token vencido não possa ser reaproveitado
        const sub = this.jwtService.decode(refreshToken)?.sub;
        if (sub) {
          await this.db.query(
            `UPDATE users SET refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
            [sub],
          );
        }
        throw new UnauthorizedException({
          code: 'SESSION_EXPIRED',
          message: 'Sua sessão expirou. Entre novamente.',
        });
      }
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Sessão inválida. Entre novamente.',
      });
    }
  }

  /**
   * Solicita a redefinição de senha. A resposta é sempre a mesma, exista ou não
   * a conta, para não revelar quais e-mails estão cadastrados.
   */
  async requestPasswordReset(rawBody: unknown) {
    const dto = ForgotPasswordSchema.parse(rawBody);
    const email = dto.email.trim().toLowerCase();
    const generic = {
      message:
        'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Ele vale por 30 minutos.',
    };

    const res = await this.db.query(
      `SELECT id, name, email FROM users
       WHERE LOWER(email) = $1 AND password_hash IS NOT NULL AND active = TRUE`,
      [email],
    );
    const user = res.rows[0];
    if (!user) return generic;

    const token = crypto.randomBytes(32).toString('hex');
    await this.db.withTransaction(async (client) => {
      // Um pedido novo invalida os links anteriores ainda não usados
      await client.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
        [user.id, sha256(token), String(RESET_TOKEN_TTL_MINUTES)],
      );
    });

    const webUrl = (process.env.WEB_PUBLIC_URL || 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    await sendMail({
      to: user.email,
      subject: '[Cidade em Foco] Redefinição de senha',
      text:
        `Olá, ${user.name}.\n\n` +
        `Recebemos um pedido para redefinir a senha da sua conta. ` +
        `Acesse o link abaixo em até ${RESET_TOKEN_TTL_MINUTES} minutos:\n\n` +
        `${webUrl}/redefinir-senha?token=${token}\n\n` +
        `Se você não fez este pedido, ignore este e-mail: sua senha continua a mesma.`,
    });

    return generic;
  }

  async resetPassword(rawBody: unknown, ip?: string) {
    const dto = ResetPasswordSchema.parse(rawBody);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userId = await this.db.withTransaction(async (client) => {
      // Consome o token de forma atômica: um link só pode ser usado uma vez
      const used = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id`,
        [sha256(dto.token)],
      );
      if (used.rows.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_RESET_TOKEN',
          message:
            'Link de redefinição inválido ou expirado. Solicite um novo link.',
        });
      }
      // Troca a senha e encerra as sessões abertas
      await client.query(
        `UPDATE users
         SET password_hash = $1, refresh_token_hash = NULL, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, used.rows[0].user_id],
      );
      return used.rows[0].user_id as string;
    });

    await this.auditService.log({
      actorId: userId,
      action: 'PASSWORD_RESET',
      entity: 'users',
      entityId: userId,
      ip: ip || null,
    });

    return { message: 'Senha redefinida com sucesso. Entre com a nova senha.' };
  }

  async logout(userId: string) {
    await this.db.query(
      `UPDATE users SET refresh_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    return { message: 'Sessão encerrada com sucesso.' };
  }
}
