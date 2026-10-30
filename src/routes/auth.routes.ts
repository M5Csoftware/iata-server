import { FastifyInstance } from 'fastify';
import { mockStore, UserAccount } from '../store/mockStore.js';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Authenticate station user or administrator using mock store',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { username, password } = request.body as { username: string; password: string };
      const normalizedUser = (username || '').trim().toLowerCase();

      let user = mockStore.users.find((u) => u.username.toLowerCase() === normalizedUser);

      // Auto fallback if admin
      if (!user && normalizedUser === 'admin' && password === 'admin') {
        user = {
          id: 'usr-admin',
          username: 'admin',
          password: 'admin',
          fullName: 'System Administrator',
          role: 'admin',
          email: 'admin@iata-cargo.org',
          stationCode: 'DEL (HQ)',
          isActive: true,
          permissions: ['dashboard', 'docket', 'stock', 'bookings', 'mawb', 'manifest', 'eawb', 'billing', 'master', 'settings'],
        };
        mockStore.users.push(user);
      }

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid Credentials',
          message: 'User does not exist with the given username.',
        });
      }

      if (!user.isActive) {
        return reply.status(403).send({
          success: false,
          error: 'Account Suspended',
          message: 'This station user account is currently deactivated.',
        });
      }

      if (user.password && user.password !== password) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid Credentials',
          message: 'The password provided is incorrect.',
        });
      }

      const token = fastify.jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      const { password: _, ...userSafe } = user;

      return reply.send({
        success: true,
        token,
        user: userSafe,
      });
    },
  });

  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Get details of the currently authenticated user',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const reqUser = request.user as { id: string; username: string };
      const user = mockStore.users.find((u) => u.id === reqUser.id || u.username === reqUser.username);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      const { password: _, ...userSafe } = user;
      return reply.send({ success: true, user: userSafe });
    },
  });

  fastify.post('/api/auth/logout', {
    schema: {
      tags: ['Authentication'],
      summary: 'Log out of station session',
    },
    handler: async (_request, reply) => {
      return reply.send({ success: true, message: 'Signed out successfully.' });
    },
  });
}
