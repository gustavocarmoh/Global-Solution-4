import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@cidade-em-foco/shared';
import { ROLES_KEY } from '../decorators/auth.decorators';
import { config } from '../config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Autenticação necessária. Faça login para continuar.',
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: config.jwtAccessSecret,
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        departmentId: payload.departmentId,
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED_OR_INVALID',
        message: 'Sua sessão expirou ou o token é inválido. Entre novamente.',
      });
    }
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: config.jwtAccessSecret,
        });
        request.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          departmentId: payload.departmentId,
        };
      } catch {
        // Ignora token inválido em rotas opcionais (permite registro sem conta)
      }
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Seu perfil não possui permissão para executar esta operação.',
      });
    }
    return true;
  }
}
