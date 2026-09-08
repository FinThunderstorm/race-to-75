import { BlockList, isIP } from 'node:net'

import type { FastifyInstance, FastifyRequest, RouteHandlerMethod } from 'fastify'

import { config } from '../config.js'

export function registerRadiatorRoutes(
  app: FastifyInstance,
  handler: RouteHandlerMethod,
  allowedIp = config.radiatorAllowedIp
) {
  const allowed = new BlockList()
  if (allowedIp) {
    allowed.addAddress(allowedIp, isIP(allowedIp) === 6 ? 'ipv6' : 'ipv4')
  }

  const isAllowed = (request: FastifyRequest) => {
    const family = isIP(request.ip)
    const matches = family !== 0 && allowed.check(request.ip, family === 6 ? 'ipv6' : 'ipv4')
    request.log.info(
      { allowlistedIp: allowedIp || null, actualIp: request.ip, allowed: matches },
      'Radiator IP access check'
    )
    return matches
  }

  app.get('/api/radiator/access', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { allowed: isAllowed(request) }
  })

  app.get(
    '/api/radiator',
    {
      preHandler: async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        if (!isAllowed(request)) {
          return reply.code(401).send({ error: 'Unauthorized' })
        }
      }
    },
    handler
  )
}
