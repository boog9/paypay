import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { User } from "./entities/user.entity";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService
  ) {}

  async signup(payload: SignupDto) {
    const email = payload.email.toLowerCase();
    const hash = await argon2.hash(payload.password, { type: argon2.argon2id });
    const user = this.usersRepo.create({
      email,
      passwordHash: hash,
      role: "merchant"
    });
    await this.usersRepo.save(user);
    return this.issueTokensForUser(user);
  }

  async validateUser(email: string, password: string) {
    const normalized = email.toLowerCase();
    const user = await this.usersRepo.findOne({ where: { email: normalized } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) throw new UnauthorizedException("Invalid credentials");
    return user;
  }

  async login(payload: LoginDto) {
    const user = await this.validateUser(payload.email.toLowerCase(), payload.password);
    return this.issueTokensForUser(user);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is required");
    }
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch (error) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const isValid = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!isValid) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const tokens = await this.signTokens(user);
    const update = await this.usersRepo.update({ id: user.id }, {
      refreshTokenHash: await this.hashRefreshToken(tokens.refreshToken)
    });
    if (!update.affected) {
      throw new UnauthorizedException("Unable to rotate refresh token");
    }
    return tokens;
  }

  async logout(userId: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.usersRepo.update({ id: userId }, { refreshTokenHash: null });
    if (!result.affected) {
      throw new UnauthorizedException();
    }
    return { success: true };
  }

  private async issueTokensForUser(user: User) {
    const tokens = await this.signTokens(user);
    const update = await this.usersRepo.update({ id: user.id }, {
      refreshTokenHash: await this.hashRefreshToken(tokens.refreshToken)
    });
    if (!update.affected) {
      throw new UnauthorizedException("Unable to persist refresh token");
    }
    return tokens;
  }

  private async signTokens(user: User) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ sub: user.id, role: user.role }),
      this.jwtService.signAsync({ sub: user.id }, { secret: refreshSecret, expiresIn: "7d" })
    ]);
    return { accessToken, refreshToken };
  }

  private hashRefreshToken(refreshToken: string) {
    return argon2.hash(refreshToken, { type: argon2.argon2id });
  }
}
