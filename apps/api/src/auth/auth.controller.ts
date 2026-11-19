import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/auth.decorators';

@ApiTags('Autenticação')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cria conta de cidadão com consentimento LGPD' })
  async register(@Body() body: unknown) {
    return this.authService.registerCitizen(body);
  }

  @Post('auth/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica cidadão (retorna JWT de 15 min + refresh token)' })
  async login(@Body() body: unknown) {
    return this.authService.loginCitizen(body);
  }

  @Post('auth/refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova o token de acesso usando o refresh token' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post('auth/forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia por e-mail um link de redefinição de senha (válido por 30 minutos)' })
  async forgotPassword(@Body() body: unknown) {
    return this.authService.requestPasswordReset(body);
  }

  @Post('auth/reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Define a nova senha a partir do token recebido por e-mail' })
  async resetPassword(@Body() body: unknown, @Ip() ip: string) {
    return this.authService.resetPassword(body, ip);
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra a sessão ativa e invalida o refresh token' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.id);
  }

  @Post('admin/auth/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login institucional com validação de papel e registro em auditoria' })
  async adminLogin(@Body() body: unknown, @Ip() ip: string) {
    return this.authService.loginAdmin(body, ip);
  }
}
