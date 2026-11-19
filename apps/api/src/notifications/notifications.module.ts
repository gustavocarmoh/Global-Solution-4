import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  OccurrenceStatus,
  OCCURRENCE_STATUS_LABELS,
} from '@cidade-em-foco/shared';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/auth.decorators';
import { decryptContact } from '../common/crypto/contact-crypto';
import { sendMail } from '../common/mailer';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async getMyNotifications(userId: string) {
    const res = await this.db.query(
      `SELECT n.id, n.occurrence_id AS "occurrenceId", o.protocol,
              n.type, n.title, n.body, n.read_at AS "readAt",
              n.sent_channels AS "sentChannels", n.created_at AS "createdAt"
       FROM notifications n
       JOIN occurrences o ON o.id = n.occurrence_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId],
    );
    return res.rows;
  }

  async markAsRead(userId: string, notificationId: string) {
    const res = await this.db.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id::text = $1 AND user_id = $2
       RETURNING id, read_at AS "readAt"`,
      [notificationId, userId],
    );
    if (!res.rows[0]) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notificação não encontrada.',
      });
    }
    return res.rows[0];
  }

  async notifyOccurrenceGroupStatusChange(params: {
    occurrenceId: string;
    groupId?: string | null;
    newStatus: OccurrenceStatus;
    statusChanged?: boolean;
    justification?: string | null;
  }): Promise<void> {
    const statusLabel = OCCURRENCE_STATUS_LABELS[params.newStatus];

    // Busca todas as ocorrências do mesmo grupo (ou apenas a própria se não tiver grupo)
    const membersRes = params.groupId
      ? await this.db.query(
          `SELECT o.id, o.protocol, o.requester_id, o.requester_contact,
                  u.email AS user_email, u.email_notifications
           FROM occurrences o
           LEFT JOIN users u ON u.id = o.requester_id
           WHERE o.group_id = $1`,
          [params.groupId],
        )
      : await this.db.query(
          `SELECT o.id, o.protocol, o.requester_id, o.requester_contact,
                  u.email AS user_email, u.email_notifications
           FROM occurrences o
           LEFT JOIN users u ON u.id = o.requester_id
           WHERE o.id = $1`,
          [params.occurrenceId],
        );

    for (const member of membersRes.rows) {
      const baseText =
        params.statusChanged === false
          ? `Sua solicitação ${member.protocol} recebeu uma nova informação (estado atual: ${statusLabel}).`
          : `Sua solicitação ${member.protocol} mudou para ${statusLabel}.`;
      const body = params.justification?.trim()
        ? `${baseText} Justificativa: ${params.justification.trim()}`
        : baseText;
      const title = `Atualização no protocolo ${member.protocol}`;

      const decryptedContact = decryptContact(member.requester_contact);
      const targetEmail =
        member.user_email && member.email_notifications !== false
          ? member.user_email
          : decryptedContact && decryptedContact.includes('@')
            ? decryptedContact
            : null;

      await this.db.query(
        `INSERT INTO notifications (user_id, contact, occurrence_id, type, title, body, sent_channels)
         VALUES ($1, $2, $3, 'status_changed', $4, $5, $6)`,
        [
          member.requester_id || null,
          targetEmail,
          member.id,
          title,
          body,
          JSON.stringify(targetEmail ? ['in_app', 'email'] : ['in_app']),
        ],
      );

      if (targetEmail) {
        // A notificação in-app já foi persistida; falha de e-mail não desfaz a operação
        await sendMail({
          to: targetEmail,
          subject: `[Cidade em Foco] ${title}`,
          text: `${body}\n\nAcompanhe sua solicitação pelo protocolo ${member.protocol} na plataforma Cidade em Foco.\nLembrete: Esta plataforma não é canal de emergência. Em emergência, ligue 190, 192 ou 193.`,
        });
      }
    }
  }
}

@ApiTags('Notificações do Cidadão')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista a caixa de notificações do cidadão autenticado' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getMyNotifications(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca uma notificação como lida' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
