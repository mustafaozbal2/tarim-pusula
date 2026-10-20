import { Controller, HttpCode, Inject, Post, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RequireMfa, Roles } from '../auth/access';
import { DB } from '../auth/auth.service';
import type { Db } from '../db/db';
import { DEFAULT_DATA_DIR } from '../places';
import { ingestFolder } from './pipeline';

export const INGEST_DIR = Symbol('INGEST_DIR');

export const defaultIngestDir = () =>
  process.env['CONTENT_INGEST_DIR'] ?? join(DEFAULT_DATA_DIR, 'icerik');

@Controller('admin/jobs')
@Roles('admin')
export class IngestController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(INGEST_DIR) private readonly dir: string,
  ) {}

  /**
   * Sunucudaki içerik klasörünü içe aktarır. Klasör istekten GELMEZ (yalnız yapılandırma),
   * böylece uç noktayla keyfi dosya okunamaz. Her şey taslak girer.
   */
  @Post('content-ingest')
  @HttpCode(200)
  @RequireMfa()
  async run() {
    if (!existsSync(this.dir) || !statSync(this.dir).isDirectory()) {
      throw new ServiceUnavailableException('İçerik klasörü yok');
    }
    return ingestFolder(this.db, this.dir);
  }
}
