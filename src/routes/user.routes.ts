import { FastifyInstance } from 'fastify';
import { User, UserRole } from '../models/User.js';

export default async function userRoutes(fastify: FastifyInstance) {
  // List users
  fastify.get('/api/users', {
    schema: {
      tags: ['Users & RBAC'],
      summary: 'Get all station users with their role & permissions',
    },
    handler: async (_request, reply) => {
      const users = await User.find().sort({ createdAt: -1 });
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
        required: ['username', 'password', 'fullName'],
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
      const existing = await User.findOne({ username: body.username.trim().toLowerCase() });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'Username Conflict',
          message: `User @${body.username} already exists.`,
        });
      }

      const user = await User.create({
        username: body.username.trim().toLowerCase(),
        password: body.password,
        fullName: body.fullName,
        role: body.role || 'user',
        email: body.email || '',
        stationCode: body.stationCode || 'DEL',
        isActive: body.isActive !== undefined ? body.isActive : true,
        permissions: body.permissions || ['dashboard'],
        avatar: body.avatar,
      });

      return reply.status(201).send({ success: true, user: user.toJSON() });
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

      const user = await User.findByIdAndUpdate(
        id,
        { $set: { permissions } },
        { new: true }
      );

      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      return reply.send({ success: true, user: user.toJSON() });
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
      const { role } = request.body as { role: UserRole };

      const allTabs = ['dashboard', 'docket', 'stock', 'bookings', 'mawb', 'manifest', 'eawb', 'billing', 'master', 'settings'];
      const updateData: any = { role };
      if (role === 'admin') {
        updateData.permissions = allTabs;
      }

      const user = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true });
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      return reply.send({ success: true, user: user.toJSON() });
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
      const user = await User.findById(id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      user.isActive = !user.isActive;
      await user.save();

      return reply.send({ success: true, user: user.toJSON() });
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
      const user = await User.findByIdAndDelete(id);
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      return reply.send({ success: true, message: 'User deleted successfully.' });
    },
  });
}

