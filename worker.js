import { connect } from 'cloudflare:sockets';

export default {
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket')
      return handleWs();
    return new Response('OK');
  }
};

async function handleWs() {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  
  const sock = connect({hostname:'ph5.vpnjantit.com', port:10004});
  const sw = sock.writable.getWriter();
  const sr = sock.readable.getReader();
  
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  await sw.write(new TextEncoder().encode(
    `GET /vpnjantit HTTP/1.1\r\nHost: ph5.vpnjantit.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
  ));
  
  let buf = new Uint8Array(0), done = false;
  while (!done) {
    const {value} = await sr.read();
    const tmp = new Uint8Array(buf.length+value.length);
    tmp.set(buf); tmp.set(value,buf.length); buf=tmp;
    for(let i=0;i<=buf.length-4;i++)
      if(buf[i]===13&&buf[i+1]===10&&buf[i+2]===13&&buf[i+3]===10){done=true;break;}
  }
  
  server.addEventListener('message', async e => {
    const d = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : new TextEncoder().encode(e.data);
    const k = crypto.getRandomValues(new Uint8Array(4));
    const h = d.length<126 ? [0x82,0x80|d.length] : [0x82,0xFE,d.length>>8,d.length&0xFF];
    const f = new Uint8Array(h.length+4+d.length);
    f.set(h); f.set(k,h.length);
    for(let i=0;i<d.length;i++) f[h.length+4+i]=d[i]^k[i%4];
    try{await sw.write(f)}catch{}
  });
  
  (async()=>{
    let b=new Uint8Array(0);
    while(true){
      const{value,done}=await sr.read(); if(done)break;
      const t=new Uint8Array(b.length+value.length); t.set(b); t.set(value,b.length); b=t;
      while(b.length>=2){
        let len=b[1]&0x7F,off=2;
        if(len===126){if(b.length<4)break;len=(b[2]<<8)|b[3];off=4;}
        if(b.length<off+len)break;
        server.send(b.slice(off,off+len).buffer);
        b=b.slice(off+len);
      }
    }
    try{server.close()}catch{}
  })();
  
  return new Response(null,{status:101,webSocket:client});
}
