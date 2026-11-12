import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { ServerConfig } from './config.js';
import { WsGameHost } from './gamehost/wsGameHost.js';
import { createRepository } from './highscores/createRepository.js';
import type { HighscoreRepository } from './highscores/repository.js';
import { startPeerServer } from './peer/peerServer.js';

export interface RunningServer {
  app: FastifyInstance;
  repo: HighscoreRepository;
  gameHost: WsGameHost | null;
  /** Actual bound HTTP port (useful with port 0). */
  port: number;
  close(): Promise<void>;
}

/**
 * Starts everything the game needs from a server: highscore HTTP API, optional
 * PeerJS signaling and optional dedicated WS game host. Used by index.ts and
 * by the smoke tests (with an in-memory store on spare ports).
 */
export async function startServer(config: ServerConfig): Promise<RunningServer> {
  const repo = await createRepository(config.store, config.dataDir);
  let gameHost: WsGameHost | null = null;
  const app = await buildApp({ config, repo, roomCount: () => gameHost?.rooms.size ?? 0 });

  if (config.wsGameHost) {
    gameHost = new WsGameHost(app.server, {
      submitResult: async (r) => {
        // 1v1 duel ratings are written by the P2P browser host to Firestore, not this hive repo.
        if (r.mission === 'duel') return { status: 'failed' };
        const res = await repo.add(r);
        return { status: 'server', rank: res.rank };
      },
      log: (...a) => app.log.info(a.join(' ')),
    });
  }

  await app.listen({ host: config.host, port: config.port });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  app.log.info(
    `Highscore API on http://localhost:${port}/api (store: ${repo.kind}, data: ${config.dataDir})`,
  );

  const peer =
    config.peerPort > 0
      ? startPeerServer(config.peerPort, config.peerPath, (m) => app.log.info(m))
      : null;

  return {
    app,
    repo,
    gameHost,
    port,
    close: async () => {
      gameHost?.close();
      peer?.close();
      await app.close();
      await repo.close();
    },
  };
}
