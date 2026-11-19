import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { PhotosModule } from './photos/photos.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RatingsModule } from './ratings/ratings.module';
import { OccurrencesModule } from './occurrences/occurrences.module';
import { DepartmentsModule } from './departments/departments.module';
import { PublicStatsModule } from './public-stats/public-stats.module';
import { ReportsModule } from './reports/reports.module';
import { InsightsModule } from './insights/insights.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          // Padrão para rotas que aplicam ThrottlerGuard sem @Throttle próprio
          ttl: 60_000,
          limit: 60,
        },
      ],
      // Apenas para rodar suítes E2E em sequência na máquina local; nunca em produção
      skipIf: () =>
        process.env.RATE_LIMIT_DISABLED === 'true' &&
        process.env.NODE_ENV !== 'production',
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    PhotosModule,
    NotificationsModule,
    RatingsModule,
    OccurrencesModule,
    DepartmentsModule,
    PublicStatsModule,
    ReportsModule,
    InsightsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
