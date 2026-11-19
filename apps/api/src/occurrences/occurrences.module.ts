import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@cidade-em-foco/shared';
import { OccurrencesService } from './occurrences.service';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/auth.decorators';
import { PhotosModule, PHOTO_UPLOAD_OPTIONS } from '../photos/photos.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminOccurrencesService } from './admin-occurrences.service';
import { AdminOccurrencesController } from './admin-occurrences.controller';

@ApiTags('Ocorrências (Cidadão e Mapa Público)')
@Controller()
export class OccurrencesController {
  constructor(private readonly occurrencesService: OccurrencesService) {}

  @Post('occurrences')
  @UseGuards(ThrottlerGuard, OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FilesInterceptor('photos', 5, PHOTO_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary:
      'Cria ocorrência com até 5 fotos (funciona com ou sem login) e retorna o protocolo CF-AAAA-NNNNNN',
  })
  async create(
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.occurrencesService.createOccurrence({
      rawBody: body,
      files,
      // Só cidadãos são solicitantes; o registro por servidor usa o endpoint de registro assistido
      requesterUser: user?.role === UserRole.CITIZEN ? user : undefined,
    });
  }

  @Get('occurrences/by-protocol/:protocol')
  @UseGuards(ThrottlerGuard, OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Consulta pública por protocolo: estado, histórico visível, categoria e bairro (sem dados pessoais)',
  })
  async findByProtocol(
    @Param('protocol') protocol: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.occurrencesService.findByProtocolPublic(protocol, user);
  }

  @Get('me/occurrences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lista solicitações da conta do cidadão autenticado' })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.occurrencesService.findMyOccurrences({
      userId: user.id,
      statusFilter: status,
      q,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get('occurrences/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Detalhe da ocorrência com fotos, histórico visível e relatos semelhantes',
  })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.occurrencesService.findOccurrenceById(id, user);
  }

  @Get('map/occurrences')
  @ApiOperation({
    summary:
      'Pontos e clusters para o mapa público anonimizado (coordenadas arredondadas em 3 casas)',
  })
  async findForPublicMap(
    @Query('bbox') bbox?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('limit') limit?: string,
  ) {
    return this.occurrencesService.findPublicMapOccurrences({
      bbox,
      category,
      status,
      neighborhood,
      limit: limit ? Number(limit) : 200,
    });
  }
}

@Module({
  imports: [PhotosModule, NotificationsModule],
  controllers: [OccurrencesController, AdminOccurrencesController],
  providers: [OccurrencesService, AdminOccurrencesService],
  exports: [OccurrencesService, AdminOccurrencesService],
})
export class OccurrencesModule {}
