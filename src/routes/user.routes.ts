import { FastifyInstance } from 'fastify';
import { mockStore, UserAccount } from '../store/mockStore.js';

export default async function userRoutes(fastify: FastifyInstance) {
  // List users
  fastify.get('/api/users', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Get all station users with their role & permissions',
    },
    handler: async (_request, reply) => {
      const users = mockStore.users.map(({ password, ...u }) => u);
      return reply.send({ success: true, count: users.length, users });
    },
  });

  // Create user
  fastify.post('/api/users', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Create a new station user account',
      body: {
        type: 'object',
        required: ['username', 'fullName'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          fullName: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          email: { type: 'string' },
          stationCode: { type: 'string' },
          isActive: { type: 'boolean' },
          permissions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (request, reply) => {
      const body = request.body as any;
      const normalized = (body.username || '').trim().toLowerCase();
      const existing = mockStore.users.find((u) => u.username.toLowerCase() === normalized);
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Username Conflict',
          message: `User @${body.username} already exists.`,
        });
      }

      const newUser: UserAccount = {
        id: `usr-${Date.now()}`,
        username: normalized,
        password: body.password || 'password123',
        fullName: body.fullName,
        role: body.role || 'user',
        email: body.email || '',
        stationCode: body.stationCode || 'DEL',
        isActive: body.isActive !== undefined ? body.isActive : true,
        permissions: body.permissions || ['dashboard'],
        avatar: body.avatar,
      };

      mockStore.users.push(newUser);
      const { password: _, ...userSafe } = newUser;
      return reply.status(201).send({ success: true, user: userSafe });
    },
  });

  // Update permissions
  fastify.put('/api/users/:id/permissions', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Update permissions array for a specific user',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['permissions'],
        properties: {
          permissions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { permissions } = request.body as { permissions: string[] };

      const user = mockStore.users.find((u) => u.id === id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      user.permissions = permissions;
      const { password: _, ...userSafe } = user;
      return reply.send({ success: true, user: userSafe });
    },
  });

  // Update role
  fastify.put('/api/users/:id/role', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Change user role (admin / user)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['admin', 'user'] },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { role } = request.body as { role: 'admin' | 'user' };

      const user = mockStore.users.find((u) => u.id === id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      user.role = role;
      if (role === 'admin') {
        user.permissions = ['dashboard', 'docket', 'stock', 'bookings', 'mawb', 'manifest', 'eawb', 'billing', 'master', 'settings'];
      }

      const { password: _, ...userSafe } = user;
      return reply.send({ success: true, user: userSafe });
    },
  });

  // Toggle active status
  fastify.patch('/api/users/:id/status', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Toggle active/inactive status of a station user',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = mockStore.users.find((u) => u.id === id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      user.isActive = !user.isActive;
      const { password: _, ...userSafe } = user;
      return reply.send({ success: true, user: userSafe });
    },
  });

  // Delete user
  fastify.delete('/api/users/:id', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Delete a station user account',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const idx = mockStore.users.findIndex((u) => u.id === id);
      if (idx === -1) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      mockStore.users.splice(idx, 1);
      return reply.send({ success: true, message: 'User deleted successfully.' });
    },
  });
}
