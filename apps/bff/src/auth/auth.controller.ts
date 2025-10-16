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
import {
  AuthSessionDto,
  AuthTokensDto,
  AuthUserResponseDto,
  LogoutResponseDto,
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

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async login(
    @Req() req: RequestWithCsrf,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponseDto> {
    const result: AuthSessionDto = await this.authService.login(dto);
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(req, res);
    const response: AuthUserResponseDto = { user: result.user };
    return response;
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

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async logout(
    @Req() req: RequestWithCsrf,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<LogoutResponseDto> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result: LogoutResponseDto = await this.authService.logout({ refreshToken });
    this.clearAuthCookies(res);
    this.csrfService.rotateToken(req, res);
    const response: LogoutResponseDto = { success: result.success };
    return response;
  }

  private applyAuthCookies(res: Response, tokens: AuthTokensDto): void {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, this.accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, this.refreshCookieOptions);
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.accessCookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.refreshCookieOptions);
  }

  private resolveRefreshToken(req: RequestWithCsrf): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const rawToken = (cookies as Record<string, unknown>)[REFRESH_TOKEN_COOKIE_NAME];
    return typeof rawToken === 'string' ? rawToken : undefined;
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
