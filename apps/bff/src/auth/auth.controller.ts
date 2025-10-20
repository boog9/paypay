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
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  AuthSessionDto,
  AuthUserResponseDto,
  RegisterResponseDto,
  SignupResponseDto,
  SignupServiceResultDto
} from './dto/auth-response.dto';
import { CsrfService } from './csrf.service';
import { RegisterDto } from './dto/register.dto';
import { resolveCookieNames } from './cookie-names';
import { setAuthCookies, clearAuthCookies } from './cookies.util';
import { CsrfGuard } from './guards/csrf.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name, { timestamp: false });
  private readonly cookieNames = resolveCookieNames();

  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService
  ) {}

  @Get('csrf')
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  getCsrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    this.issueCsrfToken(req, res);
  }

  @Get('csrf-token')
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  getLegacyCsrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    this.issueCsrfToken(req, res);
  }

  @Post('register')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    const user = await this.authService.register(dto);
    const response: RegisterResponseDto = { id: user.id, email: user.email };
    return response;
  }

  @Post('signup')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response): Promise<SignupResponseDto> {
    const result: SignupServiceResultDto = await this.authService.signup(dto);
    setAuthCookies(res, {
      accessJwt: result.auth.accessToken,
      refreshJwt: result.auth.refreshToken
    });
    const response: SignupResponseDto = { next: result.next };
    if (result.apiKey) {
      response.apiKey = result.apiKey;
    }
    return response;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('login')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    const userAgent = req.get('user-agent') ?? '';
    const clientIp = this.extractClientIp(req);
    const normalizedIp = clientIp || 'unknown';
    const normalizedUa = userAgent || 'unknown';

    try {
      const result: AuthSessionDto = await this.authService.login(dto);
      setAuthCookies(res, {
        accessJwt: result.accessToken,
        refreshJwt: result.refreshToken
      });

      this.logger.log({
        event: 'auth.login',
        userId: result.user.id,
        ip: normalizedIp,
        ua: normalizedUa,
        result: 'success'
      });
      return;
    } catch (error) {
      this.logger.warn({ event: 'auth.login', userId: null, ip: normalizedIp, ua: normalizedUa, result: 'fail' });
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponseDto> {
    const refreshToken = this.resolveRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result: AuthSessionDto = await this.authService.refresh({ refreshToken });
    setAuthCookies(res, {
      accessJwt: result.accessToken,
      refreshJwt: result.refreshToken
    });
    const response: AuthUserResponseDto = { user: result.user };
    return response;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async logout(
    @Req() req: Request,
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

    clearAuthCookies(res);
    return;
  }

  @Get('me')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: Request): Promise<AuthUserResponseDto> {
    const accessToken = this.resolveAccessToken(req);
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required.');
    }

    try {
      const user = await this.authService.verifyAccessToken(accessToken);
      return { user };
    } catch (error) {
      throw new UnauthorizedException('Access token is required.', { cause: error });
    }
  }

  private resolveRefreshToken(req: Request): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const allCookies = cookies as Record<string, unknown>;
    const rawToken = allCookies[this.cookieNames.refresh];
    return typeof rawToken === 'string' ? rawToken : undefined;
  }

  private resolveAccessToken(req: Request): string | undefined {
    const cookies: unknown = req.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const allCookies = cookies as Record<string, unknown>;
    const rawToken = allCookies[this.cookieNames.access];
    return typeof rawToken === 'string' ? rawToken : undefined;
  }

  private issueCsrfToken(req: Request, res: Response): void {
    let secret = this.csrfService.getSecretFromRequest(req);
    if (!secret) {
      secret = this.csrfService.issueSecret(res);
    }
    const token = this.csrfService.createToken(secret);
    res.setHeader('X-Csrf-Token', token);
  }

  private extractClientIp(req: Request): string {
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
