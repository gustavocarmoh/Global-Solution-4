import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { config } from '../common/config';
import { AuthController } from './auth.controller';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  RolesGuard,
} from '../common/guards/auth.guards';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: config.jwtAccessSecret,
      signOptions: { expiresIn: config.accessTtlSeconds },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class AuthModule {}
