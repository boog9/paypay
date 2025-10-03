export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

export interface AuthUserResponse {
  user: AuthUser;
}

export interface SignupResponse {
  next: string;
  apiKey?: string;
}
