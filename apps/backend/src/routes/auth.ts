import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { authenticate } from '../middleware/auth.js';
import { fetchKickChannel } from '../services/kickService.js';

const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  username: z.string().min(3, 'Nome de usuário deve ter no mínimo 3 caracteres').max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Nome de usuário inválido'),
  displayName: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(50),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  kickSlug: z.string().min(1, 'Canal Kick é obrigatório'),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Usuário ou Email obrigatório'),
  password: z.string().min(1, 'Senha obrigatória'),
  deviceInfo: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token obrigatório'),
});

export async function authRoutes(fastify: FastifyInstance) {
  // 1. Register
  fastify.post('/register', async (request, reply) => {
    try {
      const { email, username, displayName, password, kickSlug } = registerSchema.parse(request.body);

      const normalizedEmail = email.toLowerCase().trim();
      const normalizedUsername = username.toLowerCase().trim();
      const normalizedKickSlug = kickSlug.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalizedEmail },
            { username: normalizedUsername },
            { kickSlug: normalizedKickSlug }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.email === normalizedEmail) {
          return reply.status(400).send({ error: 'Este e-mail já está cadastrado' });
        }
        if (existingUser.username === normalizedUsername) {
          return reply.status(400).send({ error: 'Este nome de usuário já está em uso' });
        }
        return reply.status(400).send({ error: 'Este canal Kick já está vinculado a outra conta' });
      }

      // Fetch Kick channel details to validate slug and get avatar/display name
      const info = await fetchKickChannel(normalizedKickSlug);
      if (info.notFound) {
        return reply.status(400).send({ error: `Canal Kick '${kickSlug}' não foi encontrado` });
      }

      const passwordHash = await hashPassword(password);

      // Check if this is the first user (make them OWNER)
      const usersCount = await prisma.user.count();
      const role = usersCount === 0 ? 'OWNER' : 'USER';
      const status = usersCount === 0 ? 'APPROVED' : 'PENDING';

      // Upsert the channel in DB
      const channel = await prisma.channel.upsert({
        where: { slug: normalizedKickSlug },
        update: {
          isActive: true,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
        },
        create: {
          slug: normalizedKickSlug,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          isActive: true,
        }
      });

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          username: normalizedUsername,
          displayName,
          passwordHash,
          role,
          status,
          kickSlug: normalizedKickSlug,
          channelId: channel.id,
          coinBalance: {
            create: {
              balance: 0,
              reserved: 0
            }
          }
        }
      });

      // If owner is approved, we can also auto-create global settings if they don't exist
      if (usersCount === 0) {
        await prisma.appConfig.upsert({
          where: { id: 'global' },
          update: {},
          create: {
            coinsPerMinute: 1.0,
            maxDailyCoins: 1000,
            heartbeatInterval: 30,
            heartbeatTimeout: 90,
            maxActivePlayers: 20,
            maxChannels: 100
          }
        });
      }

      return reply.status(201).send({
        message: status === 'APPROVED' ? 'Conta criada e aprovada!' : 'Cadastro enviado com sucesso! Aguarde a aprovação de um administrador.',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          status: user.status
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno do servidor ao registrar' });
    }
  });

  // 2. Login
  fastify.post('/login', async (request, reply) => {
    try {
      const { usernameOrEmail, password, deviceInfo } = loginSchema.parse(request.body);
      const normalizedInput = usernameOrEmail.toLowerCase().trim();

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalizedInput },
            { username: normalizedInput }
          ]
        }
      });

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.status(400).send({ error: 'Usuário ou senha incorretos' });
      }

      if (user.status === 'BANNED') {
        return reply.status(403).send({ error: 'Sua conta está banida da plataforma' });
      }

      if (user.status === 'REJECTED') {
        return reply.status(403).send({ error: 'Seu cadastro foi rejeitado pelo administrador' });
      }

      // Create Session
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      
      // Temporary token for signing, we'll replace with CUID or session id
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          refreshToken: '', // placeholder, will update
          deviceInfo: deviceInfo || request.headers['user-agent'],
          ipAddress: request.ip,
          expiresAt
        }
      });

      const refreshToken = signRefreshToken({ sessionId: session.id });

      // Update session with correct refreshToken
      await prisma.session.update({
        where: { id: session.id },
        data: { refreshToken }
      });

      const accessToken = signAccessToken({
        userId: user.id,
        role: user.role,
        status: user.status
      });

      return reply.send({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          plan: user.plan,
          kickSlug: user.kickSlug,
          channelId: user.channelId,
          flagColor: user.flagColor,
          infractionCount: user.infractionCount,
          suspendedUntil: user.suspendedUntil,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno do servidor ao fazer login' });
    }
  });

  // 3. Refresh
  fastify.post('/refresh', async (request, reply) => {
    try {
      const { refreshToken } = refreshSchema.parse(request.body);

      let decoded;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (err) {
        return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
      }

      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId },
        include: { user: true }
      });

      if (!session || session.refreshToken !== refreshToken || session.revokedAt || new Date() > session.expiresAt) {
        return reply.status(401).send({ error: 'Sessão inválida, expirada ou revogada' });
      }

      if (session.user.status === 'BANNED') {
        return reply.status(403).send({ error: 'Usuário banido' });
      }

      const accessToken = signAccessToken({
        userId: session.user.id,
        role: session.user.role,
        status: session.user.status
      });

      return reply.send({ accessToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // 4. Logout
  fastify.post('/logout', async (request, reply) => {
    try {
      const { refreshToken } = refreshSchema.parse(request.body);

      let decoded;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (err) {
        return reply.status(400).send({ error: 'Refresh token inválido' });
      }

      await prisma.session.update({
        where: { id: decoded.sessionId },
        data: { revokedAt: new Date() }
      }).catch(() => {}); // ignore if already gone

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // 5. Get current profile (Me)
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        plan: true,
        kickSlug: true,
        channelId: true,
        flagColor: true,
        infractionCount: true,
        suspendedUntil: true,
        createdAt: true,
        coinBalance: {
          select: {
            balance: true,
            reserved: true
          }
        }
      }
    });

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    return reply.send({ user });
  });
}
