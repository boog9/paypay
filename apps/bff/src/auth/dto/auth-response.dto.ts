export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}
