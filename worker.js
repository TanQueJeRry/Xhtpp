import { connect } from 'cloudflare:sockets';

const TARGET = 'ph5.vpnjantit.com';
const PORT = 10004;
const PATH = '/vpnjantit';

export default {
  async fetch(request) {
    if (request.method !== 'POST' || !request.body)
      return new Response('{"ok":true}', {headers:{'Content-Type':'application/json'}});
    
    const {readable, writable} = new TransformStream();
    const writer = writable.getWriter();
    bridge(request.body, writer).catch(()=>{try{writer.close()}catch{}});
    return new Response(readable, {headers:{'Content-Type':'application/octet-stream'}});
  }
};

async function bridge(body, out) {
  const sock = connect({hostname: TARGET, port: PORT});
  const sw = sock.writable.getWriter();
  const sr = sock.readable.getReader();
  
  // WebSocket handshake with VPNJantit
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  await sw.write(new TextEncoder().encode(
    `GET ${PATH} HTTP/1.1\r\nHost: ${TARGET}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
  ));
  
  // Skip handshake response
  let buf = new Uint8Array(0);
  let done = false;
  while (!done) {
    const {value} = await sr.read();
    const tmp = new Uint8Array(buf.length + value.length);
    tmp.set(buf); tmp.set(value, buf.length); buf = tmp;
    for (let i = 0; i <= buf.length-4; i++) {
      if (buf[i]===13&&buf[i+1]===10&&buf[i+2]===13&&buf[i+3]===10) {done=true; break;}
    }
  }
  
  // Pipe VPNJantit→client
  pipeWs(sr, out);
  
  // Pipe client→VPNJantit (wrap in WS frames)
  const reader = body.getReader();
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    await sw.write(wsFrame(value));
  }
}

async function pipeWs(reader, writer) {
  let buf = new Uint8Array(0);
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      const tmp = new Uint8Array(buf.length + value.length);
      tmp.set(buf); tmp.set(value, buf.length); buf = tmp;
      while (buf.length >= 2) {
        let len = buf[1]&0x7F, off = 2;
        if (len===126){if(buf.length<4)break; len=(buf[2]<<8)|buf[3]; off=4;}
        if (buf.length < off+len) break;
        await writer.write(buf.slice(off, off+len));
        buf = buf.slice(off+len);
      }
    }
  } catch {}
  try{writer.close()}catch{}
}

function wsFrame(data) {
  const len = data.length;
  const key = crypto.getRandomValues(new Uint8Array(4));
  const h = len<126 ? new Uint8Array([0x82, 0x80|len]) :
            new Uint8Array([0x82, 0xFE, len>>8, len&0xFF]);
  const frame = new Uint8Array(h.length+4+len);
  frame.set(h); frame.set(key, h.length);
  for(let i=0;i<len;i++) frame[h.length+4+i]=data[i]^key[i%4];
  return frame;
}
