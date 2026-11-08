import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'

export async function startBackend(handler: (request: IncomingMessage, response: ServerResponse, body: Record<string, unknown>) => void) {
  const requests: { path?: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body: Record<string, unknown> = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    requests.push({ path: request.url, headers: request.headers, body })
    handler(request, response, body)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('未取得测试端口')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}
