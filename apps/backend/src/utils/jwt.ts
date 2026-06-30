import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AccessTokenPayload {
  userId: string;
  role: string;
  status: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
}

export function signRefreshToken(payload: { sessionId: string }): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.secret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sessionId: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { sessionId: string };
}
