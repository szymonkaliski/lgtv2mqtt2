import WebSocketClient from "websocket";

const POINTER_SOCKET_URI =
  "ssap://com.webos.service.networkinput/getPointerInputSocket";

const CONNECT_TIMEOUT_MS = 5000;

// The vendored client caches its pointer input socket and drops the cache entry
// only once that socket fully closes. When the TV leaves the network without
// closing it, the close waits until TCP gives up (about 15 minutes), and keys
// sent through the cached socket meanwhile never arrive. Callers open a socket
// per batch of keys instead.
//
// requestTv(uri) resolves to the TV's response payload.
export async function openPointerSocket(requestTv) {
  const response = await requestTv(POINTER_SOCKET_URI);

  if (!response?.socketPath) {
    throw new Error("tv returned no pointer input socket");
  }

  const client = new WebSocketClient.client({
    tlsOptions: { rejectUnauthorized: false },
  });

  const connection = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.abort();
      reject(new Error("connecting to the pointer input socket timed out"));
    }, CONNECT_TIMEOUT_MS);

    client.on("connect", (connection) => {
      clearTimeout(timeout);
      resolve(connection);
    });

    client.on("connectFailed", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    client.connect(response.socketPath);
  });

  connection.on("error", (error) => {
    console.error("pointer input socket error:", error);
  });

  return {
    press(key) {
      if (!connection.connected) {
        throw new Error(`pointer input socket closed before key ${key}`);
      }

      connection.sendUTF(
        key === "CLICK" ? "type:click\n\n" : `type:button\nname:${key}\n\n`
      );
    },
    close() {
      connection.close();
    },
  };
}
