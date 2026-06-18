// Transporte TCP crudo (puerto 9100 / RAW / JetDirect).
// Para impresoras de red por IP sin driver instalado.

import net from 'node:net';

export function sendTcp(
  host: string,
  port: number,
  data: Uint8Array,
  timeoutMs = 8_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.write(Buffer.from(data), (err) => {
        if (err) finish(err);
        else socket.end(); // cierre ordenado tras enviar
      });
    });
    socket.on('error', (e) => finish(e));
    socket.on('timeout', () => finish(new Error(`Timeout conectando a ${host}:${port}`)));
    socket.on('close', () => finish());
  });
}
