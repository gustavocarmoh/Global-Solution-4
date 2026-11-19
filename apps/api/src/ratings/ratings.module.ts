import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CreateRatingSchema, OccurrenceStatus } from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { OptionalJwtAuthGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/auth.decorators';
import { isUuid } from '../common/config';

@Injectable()
export class RatingsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Quem pode avaliar:
   * - solicitação vinculada a uma conta: somente o próprio solicitante autenticado;
   * - solicitação registrada sem conta: quem informar o protocolo correspondente.
   */
  async createRating(
    occurrenceId: string,
    rawBody: unknown,
    viewer?: AuthenticatedUser,
  ) {
    const dto = CreateRatingSchema.parse(rawBody);

    const occRes = isUuid(occurrenceId)
      ? await this.db.query(
          `SELECT id, status, protocol, requester_id FROM occurrences WHERE id = $1`,
          [occurrenceId],
        )
      : { rows: [] as any[] };
    const occ = occRes.rows[0];
    if (!occ) {
      throw new NotFoundException({
        code: 'OCCURRENCE_NOT_FOUND',
        message: 'Solicitação não encontrada.',
      });
    }

    if (occ.requester_id) {
      if (!viewer || viewer.id !== occ.requester_id) {
        throw new ForbiddenException({
          code: 'RATING_NOT_ALLOWED',
          message:
            'Somente quem registrou esta solicitação pode avaliá-la. Entre com a sua conta.',
        });
      }
    } else if (
      !dto.protocol ||
      dto.protocol.trim().toUpperCase() !== String(occ.protocol).toUpperCase()
    ) {
      throw new ForbiddenException({
        code: 'RATING_PROTOCOL_REQUIRED',
        message: 'Informe o protocolo da solicitação para enviar a avaliação.',
      });
    }

    if (occ.status !== OccurrenceStatus.DONE) {
      throw new BadRequestException({
        code: 'OCCURRENCE_NOT_DONE',
        message: 'A avaliação só pode ser enviada quando a solicitação estiver Concluída.',
      });
    }

    const res = await this.db.query(
      `INSERT INTO ratings (occurrence_id, stars, comment)
       VALUES ($1, $2, $3)
       ON CONFLICT (occurrence_id) DO NOTHING
       RETURNING id, occurrence_id AS "occurrenceId", stars, comment, created_at AS "createdAt"`,
      [occurrenceId, dto.stars, dto.comment?.trim() || null],
    );
    if (res.rows.length === 0) {
      throw new ConflictException({
        code: 'RATING_ALREADY_EXISTS',
        message: 'Esta solicitação já recebeu uma avaliação.',
      });
    }

    return res.rows[0];
  }
}

@ApiTags('Avaliação de Atendimento')
@Controller('occurrences/:id/rating')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @UseGuards(ThrottlerGuard, OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({
    summary:
      'Registra avaliação de 1 a 5 estrelas para solicitação concluída (dono autenticado ou portador do protocolo)',
  })
  async rate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.ratingsService.createRating(id, body, user);
  }
}

@Module({
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
