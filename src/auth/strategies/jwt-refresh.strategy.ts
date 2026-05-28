import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload, RefreshedRequestUser } from '../auth.types';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-only-refresh-secret-change-me',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<RefreshedRequestUser> {
    const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    return { ...user, refreshToken };
  }
}
