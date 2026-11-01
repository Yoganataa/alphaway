/**
 * Server Adapter for Hono + Bun.serve
 * Provides Node http.Server-compatible interface (.listen, .address, .close) for integration testing and drills.
 */

export function createServerAdapter() {
  let currentBunServer: any = null;
  const server = {
    listen(port: number, host: string | (() => void), cb?: () => void) {
      const { app } = require("../app");
      const hostname = typeof host === "string" ? host : "127.0.0.1";
      const callback = typeof host === "function" ? host : cb;
      currentBunServer = Bun.serve({
        port: port || 0,
        hostname,
        fetch: app.fetch,
      });
      if (callback) callback();
      return server;
    },
    address() {
      return {
        port: currentBunServer ? currentBunServer.port : 0,
        address: currentBunServer ? currentBunServer.hostname : "127.0.0.1",
        family: "IPv4",
      };
    },
    close(cb?: (err?: any) => void) {
      if (currentBunServer) {
        currentBunServer.stop(true);
        currentBunServer = null;
      }
      if (cb) cb();
    },
  };
  return server;
}

export const server = createServerAdapter();
