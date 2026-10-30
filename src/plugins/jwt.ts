import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ENV } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; username: string; role: string };
    user: { id: string; username: string; role: string };
  }
}

export default fp(async function jwtPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret: ENV.JWT_SECRET,
    sign: {
      expiresIn: '7d',
    },
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err: any) {
      reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token.',
      });
    }
  });
});

