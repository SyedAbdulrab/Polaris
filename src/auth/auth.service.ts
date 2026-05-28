import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult, AuthTokens, AuthenticatedUser, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Public flows ----------

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());

    const created = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name ?? null },
      select: { id: true, email: true, name: true },
    });

    return this.issueTokens(created);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    return this.issueTokens({ id: user.id, email: user.email, name: user.name });
  }

  async refresh(userId: string, presentedRefreshToken: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) {
      // Either the account vanished or the user is logged out — treat both the same.
      throw new UnauthorizedException('Refresh token rejected');
    }

    const matches = await bcrypt.compare(presentedRefreshToken, user.refreshTokenHash);
    if (!matches) {
      // Possible token reuse — invalidate the session as a safety measure.
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Refresh token rejected');
    }

    return this.issueTokens({ id: user.id, email: user.email, name: user.name });
  }

  async logout(userId: string): Promise<{ success: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  // ---------- Token plumbing ----------

  private async issueTokens(user: AuthenticatedUser): Promise<AuthResult> {
    const tokens = await this.signTokens(user);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, this.bcryptRounds());

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return { ...tokens, user };
  }

  private async signTokens(user: AuthenticatedUser): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-only-access-secret-change-me',
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      }),
      this.jwt.signAsync(payload, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-only-refresh-secret-change-me',
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private bcryptRounds(): number {
    return Number(this.config.get('BCRYPT_ROUNDS')) || 10;
  }
}
