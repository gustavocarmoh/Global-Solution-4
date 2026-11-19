import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@cidade-em-foco/shared';
import { AdminOccurrencesService } from './admin-occurrences.service';
import { OccurrencesService } from './occurrences.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.module';
import { PHOTO_UPLOAD_OPTIONS } from '../photos/photos.module';

@ApiTags('Administração — Operação Municipal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TRIAGE, UserRole.DEPARTMENT, UserRole.MANAGER, UserRole.ADMIN)
@Controller('admin')
export class AdminOccurrencesController {
  constructor(
    private readonly adminOccurrencesService: AdminOccurrencesService,
    private readonly occurrencesService: OccurrencesService,
    private readonly auditService: AuditService,
  ) {}

  @Get('occurrences')
  @ApiOperation({
    summary:
      'Lista solicitações com filtros (busca, estado, categoria, departamento, prioridade, bairro) e ordenação por prioridade e data',
  })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
    @Query('priority') priority?: string,
    @Query('neighborhood') neighborhood?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminOccurrencesService.listAdminOccurrences({
      user,
      q,
      status,
      category,
      departmentId,
      priority,
      neighborhood,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 8,
    });
  }

  @Get('occurrences/:id')
  @ApiOperation({
    summary: 'Detalhe administrativo completo com fotos, mini-mapa, semelhantes e histórico',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminOccurrencesService.getAdminOccurrenceDetail(id, user);
  }

  @Patch('occurrences/:id')
  @ApiOperation({
    summary:
      'Altera estado, prioridade, departamento e justificativa; grava histórico, auditoria e notifica cidadãos associados',
  })
  async updateOccurrence(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.adminOccurrencesService.updateOccurrenceAdmin({
      id,
      rawBody: body,
      user,
      ip,
    });
  }

  @Post('occurrences/assisted')
  @UseInterceptors(FilesInterceptor('photos', 5, PHOTO_UPLOAD_OPTIONS))
  @ApiOperation({
    summary:
      'Registro assistido: funcionário municipal registra solicitação em nome de cidadão atendido no balcão ou telefone',
  })
  async createAssisted(
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    const created = await this.occurrencesService.createOccurrence({
      rawBody: body,
      files,
      assistedByUserId: user.id,
    });

    await this.auditService.log({
      actorId: user.id,
      action: 'ASSISTED_OCCURRENCE_CREATED',
      entity: 'occurrences',
      entityId: created.id,
      after: { protocol: created.protocol, assistedByUserId: user.id },
      ip,
    });

    return created;
  }

  @Post('occurrences/:id/group')
  @ApiOperation({ summary: 'Associa ou desassocia duplicidades manualmente' })
  async manageGroup(
    @Param('id') id: string,
    @Body() body: { targetProtocol?: string; action?: 'link' | 'unlink' },
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.adminOccurrencesService.manageDuplicateGroup({
      occurrenceId: id,
      targetProtocol: body.targetProtocol,
      action: body.action || 'link',
      user,
      ip,
    });
  }

  @Get('map')
  @ApiOperation({
    summary:
      'Mapa administrativo com clusters e filtros por bairro, categoria, estado e departamento',
  })
  async getAdminMap(
    @CurrentUser() user: AuthenticatedUser,
    @Query('neighborhood') neighborhood?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.adminOccurrencesService.getAdminMapData({
      user,
      neighborhood,
      category,
      status: status ?? 'open',
      departmentId,
    });
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Consulta logs de auditoria administrativa (somente Administrador)' })
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditService.findAll(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }
}
