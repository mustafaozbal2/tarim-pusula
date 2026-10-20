import {
  BadRequestException,
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@tarim/schemas';
import type { ZodType } from 'zod';
import type { Principal } from '../db/db';
import { AuthService } from './auth.service';

const PUBLIC = 'tp:public';
const ROLES = 'tp:roles';
const MFA = 'tp:mfa';

/** Giriş gerektirmeyen uç (OTP isteği/doğrulama, sağlık). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Oturumun ikinci adımı (TOTP) geçmiş olmasını zorunlu kılar (panel uçları). */
export const RequireMfa = () => SetMetadata(MFA, true);
/** Bu rollerden en az birine sahip olmayı zorunlu kılar. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

interface AuthedRequest {
  headers: Record<string, string | undefined>;
  principal?: Principal;
  token?: string;
}

/** Varsayılan: her uç giriş ister. Açık olan uçlar @Public ile işaretlenir. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const principal = token ? await this.auth.authenticate(token) : null;
    if (!principal) throw new UnauthorizedException('Giriş yapmanız gerekiyor');
    req.principal = principal;
    req.token = token;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (required && !required.some((r) => principal.roles.includes(r))) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    if (this.reflector.getAllAndOverride<boolean>(MFA, targets) && !principal.mfa) {
      throw new ForbiddenException('İkinci adım doğrulaması gerekiyor');
    }
    return true;
  }
}

export const Me = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest<AuthedRequest>().principal!,
);
export const Token = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthedRequest>().token!,
);

/** Zod ile doğrula; hata Türkçe mesajla 400 döner. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  }
  return r.data;
}
