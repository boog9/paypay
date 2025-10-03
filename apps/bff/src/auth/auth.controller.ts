import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResult, AuthUserResponse, SignupResponse } from './dto/auth-response.dto';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_TTL_S,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS
} from './auth.constants';
import { CsrfService, RequestWithCsrf } from './csrf.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  private readonly accessCookieOptions: CookieOptions;
  private readonly refreshCookieOptions: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly configService: ConfigService
  ) {
    const domain = this.resolveCookieDomain();
    this.accessCookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: ACCESS_TOKEN_TTL_S * 1000,
      path: ACCESS_TOKEN_COOKIE_PATH,
      domain
    };
    this.refreshCookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: REFRESH_TOKEN_TTL_MS,
      path: REFRESH_TOKEN_COOKIE_PATH,
      domain
    };
  }

  @Get('csrf-token')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  getCsrfToken(
    @Req() req: RequestWithCsrf,
    @Res({ passthrough: true }) res: Response
  ): { csrfToken: string } {
    const token = this.csrfService.issueToken(req, res);
    return { csrfToken: token };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Req() req: RequestWithCsrf,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const user = await this.authService.register(dto);
    this.csrfService.rotateToken(req, res);
    return { id: user.id, email: user.email };
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async signup(
    @Req() req: RequestWithCsrf,
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignupResponse> {
    const result = await this.authService.signup(dto);
    this.applyAuthCookies(res, result.auth);
    this.csrfService.rotateToken(req, res);
    return result.apiKey ? { next: result.next, apiKey: result.apiKey } : { next: result.next };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async login(
    @Req() req: RequestWithCsrf,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponse> {
    const result = await this.authService.login(dto);
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(req, res);
    return { user: result.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async refresh(
    @Req() req: RequestWithCsrf,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponse> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result = await this.authService.refresh({ refreshToken });
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(req, res);
    return { user: result.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async logout(
    @Req() req: RequestWithCsrf,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ success: boolean }> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result = await this.authService.logout({ refreshToken });
    this.clearAuthCookies(res);
    this.csrfService.rotateToken(req, res);
    return result;
  }

  private applyAuthCookies(res: Response, result: AuthResult): void {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, this.accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, this.refreshCookieOptions);
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.accessCookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.refreshCookieOptions);
  }

  private resolveRefreshToken(req: RequestWithCsrf): string | undefined {
    return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  }

  private resolveCookieDomain(): string {
    const raw = this.configService.get<string>('PAYPAY_DOMAIN') ?? '.iddqd.in';
    const trimmed = raw.trim();
    if (!trimmed) {
      return '.iddqd.in';
    }
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  }
}
