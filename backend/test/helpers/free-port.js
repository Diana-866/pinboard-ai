"use strict";

const net = require("node:net");

/**
 * A TCP port the operating system just handed out and nobody else holds.
 *
 * Tests used to pick `36000 + Math.random() * 2000`. Two hundred tests spawning a child backend
 * from a two-thousand-port range collide by the birthday paradox, and the losing child dies with
 * EADDRINUSE before it can answer /health - the run reports "backend did not start" for a test
 * that has nothing to do with ports. Asking the kernel for a port removes the guesswork; the tiny
 * window between close() and the child's bind is covered by the caller's retry.
 */
function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("could not reserve a port"))));
    });
  });
}

module.exports = { reservePort };
