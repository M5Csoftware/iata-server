import { FastifyInstance } from 'fastify';
import { User } from '../models/User.js';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Authenticate station user or administrator',
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

      let user = await User.findOne({ username: normalizedUser });

      // Special fallback if DB was somehow fresh and admin/admin was entered
      if (!user && normalizedUser === 'admin' && password === 'admin') {
        user = await User.create({
          username: 'admin',
          password: 'admin',
          fullName: 'System Administrator',
          role: 'admin',
          email: 'admin@iata-cargo.org',
          stationCode: 'DEL (HQ)',
          isActive: true,
          permissions: ['dashboard', 'docket', 'stock', 'bookings', 'mawb', 'manifest', 'eawb', 'billing', 'master', 'settings'],
        });
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

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid Credentials',
          message: 'The password provided is incorrect.',
        });
      }

      const token = fastify.jwt.sign({
        id: user._id.toString(),
        username: user.username,
        role: user.role,
      });

      return reply.send({
        success: true,
        token,
        user: user.toJSON(),
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
      const user = await User.findById(reqUser.id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      return reply.send({ success: true, user: user.toJSON() });
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

