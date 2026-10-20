import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { PageText } from '@tarim/agro-core';
import { libraryDocumentSchema, librarySearchSchema } from '@tarim/schemas';
import { Me, parse, RequireMfa, Roles } from './auth/access';
import { DataService } from './data.service';
import type { Principal } from './db/db';
import { pdfToPages, searchLibrary, storeDocument, textToPages } from './library';

@Controller('library')
export class LibraryController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /** Giriş yapmış herkes arar. Kaynaksız parça dönmez; onaysız içerik rozetle gelir. */
  @Get('search')
  async search(@Me() me: Principal, @Query() query: unknown) {
    const { q, topK } = parse(librarySearchSchema, query);
    const hits = await this.data.run(me, 'library.search', (tx) => searchLibrary(tx, q, topK));
    return { query: q, hits };
  }

  @Get('documents')
  documents(@Me() me: Principal) {
    return this.data.run(me, 'library.documents', (q) =>
      q.query(
        `SELECT id, title, publisher, source_date AS "sourceDate", source_version AS "sourceVersion",
           source_url AS "sourceUrl", license_note AS "licenseNote", tier,
           review_status AS "reviewStatus", page_count AS "pageCount"
         FROM library_documents ORDER BY created_at DESC LIMIT 200`,
      ),
    );
  }

  /** Doküman yükleme (düz metin ya da PDF). Her zaman taslak başlar; uzman onayına kadar rozetli. */
  @Post('documents')
  @RequireMfa()
  @Roles('institution_admin', 'expert', 'admin')
  async upload(@Me() me: Principal, @Body() body: unknown) {
    const d = parse(libraryDocumentSchema, body);
    let pages: PageText[];
    if (d.text !== undefined) {
      pages = textToPages(d.text);
    } else {
      const bytes = Buffer.from(d.pdfBase64!, 'base64');
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new BadRequestException('Dosya PDF değil');
      }
      try {
        pages = await pdfToPages(new Uint8Array(bytes));
      } catch {
        throw new BadRequestException('PDF okunamadı');
      }
    }
    if (pages.length === 0) {
      throw new BadRequestException('Belgede okunabilir metin yok (taranmış PDF olabilir)');
    }
    try {
      const r = await this.data.run(me, 'library.upload', (q) =>
        storeDocument(q, me.userId, d, pages),
      );
      return { ...r, reviewStatus: 'taslak-uzman-onayi-bekliyor' };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('Bu doküman (aynı içerik ve sürüm) zaten kayıtlı');
      }
      throw e;
    }
  }

  @Post('documents/:id/approve')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async approve(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'library.approve', id, async (q) => {
      const rows = await q.query(
        `UPDATE library_documents SET review_status = 'uzman-onayli', reviewed_by = $2
         WHERE id = $1 RETURNING id`,
        [id, me.userId],
      );
      return rows.length ? true : undefined;
    });
    return { id, reviewStatus: 'uzman-onayli' };
  }
}
