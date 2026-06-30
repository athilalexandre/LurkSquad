import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  database: {
    url: process.env.DATABASE_URL!,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessExpiresIn: '15m',
    refreshExpiresIn: '30d',
    refreshExpiresMs: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'tauri://localhost,http://tauri.localhost,http://localhost:1420').split(','),
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },

  coins: {
    perMinute: 1,
    maxDaily: 1000,
  },

  heartbeat: {
    intervalSeconds: 30,
    timeoutSeconds: 90,
  },
} as const;
