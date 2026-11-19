import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTOS_PER_OCCURRENCE = 5;
const MAX_FILE_SIZE_BYTES = MAX_PHOTO_SIZE_BYTES;

/** Opções do multer: o limite é aplicado durante o upload, antes de o arquivo ocupar a memória. */
export const PHOTO_UPLOAD_OPTIONS = {
  limits: { fileSize: MAX_PHOTO_SIZE_BYTES, files: MAX_PHOTOS_PER_OCCURRENCE },
};

/** Identifica o formato real pela assinatura do arquivo (o mimetype enviado pelo cliente não é confiável). */
export function detectImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export interface ProcessedPhotoKeys {
  storageKey: string;
  thumbKey: string;
}

@Injectable()
export class PhotosService {
  private s3: S3Client;
  private bucket: string;
  private localFallbackDir: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'cidade-em-foco';
    this.localFallbackDir = path.resolve(process.cwd(), 'uploads');

    this.s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin123',
      },
    });
  }

  private async ensureBucket(): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        return true;
      } catch {
        return false;
      }
    }
  }

  async processAndStorePhotos(
    files: Express.Multer.File[] = [],
  ): Promise<ProcessedPhotoKeys[]> {
    if (!files || files.length === 0) return [];
    if (files.length > 5) {
      throw new BadRequestException({
        code: 'MAX_PHOTOS_EXCEEDED',
        message: 'São permitidas no máximo 5 fotos por solicitação.',
      });
    }

    for (const file of files) {
      const realMime = detectImageMime(file.buffer);
      if (!realMime || !ALLOWED_MIME_TYPES.includes(realMime)) {
        throw new BadRequestException({
          code: 'INVALID_PHOTO_TYPE',
          message: 'Formato de imagem inválido. Envie apenas JPEG, PNG ou WebP.',
        });
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException({
          code: 'PHOTO_TOO_LARGE',
          message: 'Cada foto pode ter no máximo 5 MB.',
        });
      }
    }

    const s3Available = await this.ensureBucket();
    const results: ProcessedPhotoKeys[] = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const storageKey = `occurrences/${id}.webp`;
      const thumbKey = `occurrences/${id}-thumb.webp`;

      let mainBuffer: Buffer;
      let thumbBuffer: Buffer;
      try {
        mainBuffer = await sharp(file.buffer)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        thumbBuffer = await sharp(file.buffer)
          .rotate()
          .resize({ width: 400, height: 400, fit: 'cover' })
          .webp({ quality: 75 })
          .toBuffer();
      } catch {
        throw new BadRequestException({
          code: 'INVALID_PHOTO_CONTENT',
          message:
            'Não foi possível processar uma das imagens. Envie um arquivo JPEG, PNG ou WebP válido.',
        });
      }

      if (s3Available) {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: mainBuffer,
            ContentType: 'image/webp',
          }),
        );
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: 'image/webp',
          }),
        );
      } else {
        // Sem MinIO/S3 disponível (ex.: dev sem Docker), grava em disco local
        await fs.promises.mkdir(this.localFallbackDir, { recursive: true });
        const localMain = path.join(this.localFallbackDir, `${id}.webp`);
        const localThumb = path.join(this.localFallbackDir, `${id}-thumb.webp`);
        await fs.promises.writeFile(localMain, mainBuffer);
        await fs.promises.writeFile(localThumb, thumbBuffer);
      }

      results.push({ storageKey, thumbKey });
    }

    return results;
  }

  getPublicPhotoUrl(key: string): string {
    return `/api/v1/photos/view/${encodeURIComponent(key)}`;
  }

  resolveLocalFilePath(key: string): string | null {
    const baseName = path.basename(key);
    const candidate = path.join(this.localFallbackDir, baseName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    return null;
  }

  /** Lê o objeto do bucket S3/MinIO; retorna null se não existir ou o serviço estiver indisponível. */
  async readFromBucket(key: string): Promise<Buffer | null> {
    try {
      const out = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!out.Body) return null;
      const bytes = await out.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }
}

@ApiTags('Fotos de Ocorrências')
@Controller('photos')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get('view/:key(*)')
  @ApiOperation({ summary: 'Retorna imagem ou miniatura da ocorrência (bucket S3/MinIO, disco local ou SVG ilustrativo do seed)' })
  async viewPhoto(@Param('key') key: string, @Res() res: Response) {
    // Fotos de exemplo do seed: SVG institucional gerado na hora
    if (key.startsWith('placeholder/')) {
      const label = escapeXml(
        key.replace('placeholder/', '').replace('.svg', '').slice(0, 60),
      );
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#dcefe9"/>
      <rect x="24" y="24" width="552" height="352" rx="16" fill="#ffffff" stroke="#0b5d4b" stroke-width="2"/>
      <circle cx="300" cy="165" r="44" fill="#0b5d4b"/>
      <path d="M284 165h32M300 149v32" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      <text x="300" y="255" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1b2420">Foto ilustrativa — Cidade em Foco</text>
      <text x="300" y="288" text-anchor="middle" font-family="monospace" font-size="15" fill="#4a554f">${label}</text>
    </svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(svg);
      return;
    }

    if (!/^occurrences\/[0-9a-f-]{36}(-thumb)?\.webp$/i.test(key)) {
      throw new NotFoundException({
        code: 'PHOTO_NOT_FOUND',
        message: 'Imagem não encontrada.',
      });
    }

    const fromBucket = await this.photosService.readFromBucket(key);
    if (fromBucket) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(fromBucket);
      return;
    }

    const localFile = this.photosService.resolveLocalFilePath(key);
    if (localFile) {
      res.setHeader('Content-Type', 'image/webp');
      res.sendFile(localFile);
      return;
    }

    throw new NotFoundException({
      code: 'PHOTO_NOT_FOUND',
      message: 'Imagem não encontrada.',
    });
  }
}

@Module({
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
