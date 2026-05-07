/**
 * Frontend mirror of API auth response shapes. Kept inline here for V1; if
 * a third client appears (mobile, OBS overlay) we'll lift these into a
 * shared `packages/api-contracts` package.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: Array<{
    role: string;
    federationId: string | null;
    competitionId: string | null;
  }>;
}

export interface LoginResponse {
  user: Pick<AuthUser, 'id' | 'email' | 'displayName'>;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface MeResponse {
  user: AuthUser;
}

export interface ApiError {
  error: { code: string; message: string; requestId?: string };
}
