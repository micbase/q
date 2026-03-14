import * as http from 'http'
import * as net from 'net'
import { config } from '../config'
import * as db from '../db/queries'
import { getContainerIp } from '../worker/provisioner'

interface ParsedHost {
  projectName: string
  ticketId: string
}

function parseHost(host: string | undefined): ParsedHost | null {
  if (!host) return null
  // Strip port
  const hostname = host.split(':')[0]
  const suffix = `.${config.proxyDomain}`
  if (!hostname.endsWith(suffix)) return null
  const prefix = hostname.slice(0, -suffix.length)
  const dot = prefix.indexOf('.')
  if (dot < 1 || dot !== prefix.lastIndexOf('.')) return null
  return { projectName: prefix.slice(0, dot), ticketId: prefix.slice(dot + 1) }
}

async function resolve(host: string | undefined): Promise<{ ip: string } | { error: string; code: number }> {
  const parsed = parseHost(host)
  if (!parsed) return { error: 'Bad host', code: 404 }

  const ticket = await db.getTicket(parsed.ticketId)
  if (!ticket) return { error: 'Ticket not found', code: 404 }

  const project = await db.getProject(ticket.project_id)
  if (!project || project.name !== parsed.projectName) return { error: 'Project mismatch', code: 404 }

  const ip = await getContainerIp(parsed.ticketId)
  if (!ip) return { error: 'Container not running', code: 503 }

  return { ip }
}

function errorResponse(res: http.ServerResponse, code: number, msg: string): void {
  res.writeHead(code, { 'Content-Type': 'text/plain' })
  res.end(msg)
}

export function createProxyServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    const result = await resolve(req.headers.host)
    if ('error' in result) return errorResponse(res, result.code, result.error)

    const target = `${result.ip}:${config.devServerPort}`
    const proxyReq = http.request(
      { hostname: result.ip, port: config.devServerPort, path: req.url, method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('error', () => errorResponse(res, 502, `Upstream error (${target})`))
    req.pipe(proxyReq)
  })

  server.on('upgrade', async (req, socket: net.Socket, head) => {
    const result = await resolve(req.headers.host)
    if ('error' in result) {
      socket.end(`HTTP/1.1 ${result.code} ${result.error}\r\n\r\n`)
      return
    }

    const upstream = net.connect(config.devServerPort, result.ip, () => {
      const reqLine = `${req.method} ${req.url} HTTP/1.1\r\n`
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n')
      upstream.write(reqLine + headers + '\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })

    upstream.on('error', () => {
      socket.end(`HTTP/1.1 502 Upstream error\r\n\r\n`)
    })
    socket.on('error', () => upstream.destroy())
  })

  return server
}
