export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

export interface RefreshedRequestUser extends AuthenticatedUser {
  // The raw refresh token, attached by the refresh strategy so the service
  // can compare it against the hash stored on the user row.
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthenticatedUser;
}
