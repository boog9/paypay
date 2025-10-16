export interface AuthUserDto {
  id: string;
  email: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSessionDto extends AuthTokensDto {
  user: AuthUserDto;
}

export interface AuthUserResponseDto {
  user: AuthUserDto;
}

export interface SignupServiceResultDto {
  auth: AuthSessionDto;
  next: string;
  apiKey?: string;
}

export interface SignupResponseDto {
  next: string;
  apiKey?: string;
}

export interface RegisterResponseDto {
  id: string;
  email: string;
}

export interface LogoutResponseDto {
  success: boolean;
}
