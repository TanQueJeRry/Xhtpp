export default {
  async fetch(request) {
    const targetHost = "ph5.vpnjantit.com";
    const targetPort = "10004";  // plain WS, no TLS
    const targetPath = "/vpnjantit";

    const url = new URL(request.url);
    if (url.pathname === targetPath) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
        const [client, server] = Object.values(new WebSocketPair());
        const targetUrl = `ws://${targetHost}:${targetPort}${targetPath}`;
        const targetSocket = new WebSocket(targetUrl);

        targetSocket.addEventListener("open", () => {
          targetSocket.addEventListener("message", event => {
            server.send(event.data);
          });
          server.addEventListener("message", event => {
            targetSocket.send(event.data);
          });
          server.accept(); // complete client handshake
        });

        targetSocket.addEventListener("error", () => {
          client.close(1011, "Backend connection failed");
        });
        targetSocket.addEventListener("close", () => {
          client.close();
        });

        return new Response(null, { status: 101, webSocket: client });
      }
    }
    return new Response("Not Found", { status: 404 });
  }
}
