import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../config.js';
import { randomToken } from './session.js';

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(config.SESSION_COOKIE_NAME, { path: '/' });
}

export function issueCsrfToken(reply: FastifyReply, config: AppConfig): string {
  const token = randomToken();
  reply.setCookie(config.CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return token;
}
