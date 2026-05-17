export default {
  async fetch(request) {
    const backendHost = "ph5.vpnjantit.com";
    const backendPort = "10004";
    const backendPath = "/vpnjantit";

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Not Found", { status: 404 });
    }

    // Prepare backend URL
    const backendUrl = `http://${backendHost}:${backendPort}${backendPath}`;

    // Prepare headers for the backend, remove hop-by-hop ones
    const headers = new Headers(request.headers);
    headers.set("Host", `${backendHost}:${backendPort}`);
    headers.set("Origin", `http://${backendHost}:${backendPort}`);
    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-proto");
    headers.delete("x-forwarded-for");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");

    const backendRequest = new Request(backendUrl, {
      method: "GET",
      headers: headers,
    });

    // Cloudflare will automatically handle the WebSocket upgrade for this fetch
    const backendResponse = await fetch(backendRequest);

    // 101 means upgrade succeeded, return the response directly
    if (backendResponse.status === 101) {
      return backendResponse;
    }

    // Fallback if backend did not upgrade
    return new Response("Backend WebSocket handshake failed", { status: 502 });
  }
};
