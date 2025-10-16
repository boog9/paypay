import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import {
  AuthSessionDto,
  AuthTokensDto,
  AuthUserResponseDto,
  RegisterResponseDto,
  SignupResponseDto,
  SignupServiceResultDto
} from './dto/auth-response.dto';
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
import { resolveCookieTarget } from './cookie.utils';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name, { timestamp: false });
  private accessCookieOptions!: CookieOptions;
  private refreshCookieOptions!: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly configService: ConfigService
  ) {
    this.makeCookieOptions();
  }

  @Get('csrf')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  getCsrf(@Req() req: RequestWithCsrf, @Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const token = this.csrfService.issueToken(req, res);
    return { csrfToken: token };
  }

  @Get('csrf-token')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  getLegacyCsrf(
    @Req() req: RequestWithCsrf,
    @Res({ passthrough: true }) res: Response
  ): { csrfToken: string } {
    return this.getCsrf(req, res);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Req() req: RequestWithCsrf,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<RegisterResponseDto> {
    const user = await this.authService.register(dto);
    this.csrfService.rotateToken(req, res);
    const response: RegisterResponseDto = { id: user.id, email: user.email };
    return response;
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async signup(
    @Req() req: RequestWithCsrf,
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignupResponseDto> {
    const result: SignupServiceResultDto = await this.authService.signup(dto);
    this.applyAuthCookies(res, result.auth);
    this.csrfService.rotateToken(req, res);
    const response: SignupResponseDto = { next: result.next };
    if (result.apiKey) {
      response.apiKey = result.apiKey;
    }
    return response;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async login(
    @Req() req: RequestWithCsrf,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    const userAgent = req.get('user-agent') ?? '';
    const clientIp = this.extractClientIp(req);
    const normalizedIp = clientIp || 'unknown';
    const normalizedUa = userAgent || 'unknown';

    try {
      const result: AuthSessionDto = await this.authService.login(dto);
      this.applyAuthCookies(res, result);
      this.csrfService.rotateToken(req, res);

      this.logger.log({
        event: 'auth.login',
        userId: result.user.id,
        ip: normalizedIp,
        ua: normalizedUa,
        result: 'success'
      });
      res.status(HttpStatus.NO_CONTENT);
      return;
    } catch (error) {
      this.logger.warn({ event: 'auth.login', userId: null, ip: normalizedIp, ua: normalizedUa, result: 'fail' });
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async refresh(
    @Req() req: RequestWithCsrf,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponseDto> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result: AuthSessionDto = await this.authService.refresh({ refreshToken });
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(req, res);
    const response: AuthUserResponseDto = { user: result.user };
    return response;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async logout(
    @Req() req: RequestWithCsrf,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;

    if (refreshToken) {
      try {
        await this.authService.logout({ refreshToken });
      } catch {
        this.logger.warn({ event: 'auth.logout', result: 'revocation_failed' });
      }
    }

    this.clearAuthCookies(res);
    this.csrfService.rotateToken(req, res);
    res.status(HttpStatus.NO_CONTENT);
    return;
  }

  @Get('me')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: RequestWithCsrf): Promise<AuthUserResponseDto> {
    const accessToken = this.resolveAccessToken(req);
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required.');
    }

    const user = await this.authService.verifyAccessToken(accessToken);
    return { user };
  }

  private applyAuthCookies(res: Response, tokens: AuthTokensDto): void {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, this.accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, this.refreshCookieOptions);
  }

  private clearAuthCookies(res: Response): void {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, '', { ...this.accessCookieOptions, maxAge: 0 });
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, '', { ...this.refreshCookieOptions, maxAge: 0 });
  }

  private resolveRefreshToken(req: RequestWithCsrf): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const rawToken = (cookies as Record<string, unknown>)[REFRESH_TOKEN_COOKIE_NAME];
    return typeof rawToken === 'string' ? rawToken : undefined;
  }

  private resolveAccessToken(req: RequestWithCsrf): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const rawToken = (cookies as Record<string, unknown>)[ACCESS_TOKEN_COOKIE_NAME];
    return typeof rawToken === 'string' ? rawToken : undefined;
  }

  private makeCookieOptions(): void {
    const { isLocal, domain } = resolveCookieTarget({
      frontendOrigin: this.configService.get<string>('FRONTEND_ORIGIN'),
      fallbackDomain: this.configService.get<string>('PAYPAY_DOMAIN')
    });

    this.accessCookieOptions = {
      httpOnly: true,
      secure: !isLocal,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_S * 1000,
      path: ACCESS_TOKEN_COOKIE_PATH,
      ...(domain ? { domain } : {})
    };
    this.refreshCookieOptions = {
      httpOnly: true,
      secure: !isLocal,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_MS,
      path: REFRESH_TOKEN_COOKIE_PATH,
      ...(domain ? { domain } : {})
    };
  }

  private extractClientIp(req: RequestWithCsrf): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      return forwarded.split(',')[0]?.trim() ?? '';
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0]?.trim() ?? '';
    }
    if (Array.isArray(req.ips) && req.ips.length > 0) {
      return req.ips[0] ?? '';
    }
    if (typeof req.ip === 'string' && req.ip.trim().length > 0) {
      return req.ip;
    }
    const socketIp = req.socket?.remoteAddress;
    return typeof socketIp === 'string' ? socketIp : '';
  }
}
