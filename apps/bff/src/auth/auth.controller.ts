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
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResult, AuthUserResponse } from './dto/auth-response.dto';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_TTL_S,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS
} from './auth.constants';
import { CsrfService } from './csrf.service';

const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'strict' as const,
  maxAge: ACCESS_TOKEN_TTL_S * 1000,
  path: ACCESS_TOKEN_COOKIE_PATH
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'strict' as const,
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: REFRESH_TOKEN_COOKIE_PATH
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly csrfService: CsrfService) {}

  @Get('csrf-token')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  getCsrfToken(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const token = this.csrfService.issueToken(res);
    return { csrfToken: token };
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response): Promise<AuthUserResponse> {
    const result = await this.authService.signup(dto);
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(res);
    return { user: result.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthUserResponse> {
    const result = await this.authService.login(dto);
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(res);
    return { user: result.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthUserResponse> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result = await this.authService.refresh({ refreshToken });
    this.applyAuthCookies(res, result);
    this.csrfService.rotateToken(res);
    return { user: result.user };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async logout(
    @Req() req: Request,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ success: boolean }> {
    const refreshToken = this.resolveRefreshToken(req) ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result = await this.authService.logout({ refreshToken });
    this.clearAuthCookies(res);
    this.csrfService.rotateToken(res);
    return result;
  }

  private applyAuthCookies(res: Response, result: AuthResult): void {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, ACCESS_COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  }

  private resolveRefreshToken(req: Request): string | undefined {
    return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  }
}
