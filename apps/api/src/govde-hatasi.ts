import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';

/**
 * Bozuk JSON gövdesi: ayrıştırıcının İngilizce iç iletisi (konum, belirteç) dışarı sızmaz; çiftçi dilinde kısa ileti döner.
 * Diğer 400 hataları (doğrulama) olduğu gibi kalır.
 */
@Catch(HttpException)
export class GovdeHatasiFiltresi implements ExceptionFilter {
  catch(e: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<{
      status(n: number): { json(b: unknown): void };
    }>();
    const durum = e.getStatus();
    const ham = e.getResponse();
    const mesaj = typeof ham === 'string' ? ham : ((ham as { message?: unknown }).message ?? '');
    const govde =
      durum === 400 && /JSON|Unexpected token|position \d+|is not valid/i.test(String(mesaj));
    res
      .status(durum)
      .json(
        govde
          ? { statusCode: 400, error: 'Bad Request', message: 'İstek gövdesi geçerli JSON değil.' }
          : ham,
      );
  }
}
