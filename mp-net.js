// Galope Mágico · dupla em dois celulares pelo Wi-Fi (porta de teste-dupla.html).
// NET: sala por código (PeerJS; a internet só para o primeiro contato), mensagens em ordem e relógio comum (o da sala).
// CAL: medição da sincronia do som pelo microfone.
// Ao carregar não faz rede nem som: o PeerJS só é carregado no primeiro host()/join().
// Testes, na URL da página: ?srv=127.0.0.1:9000 (sinalização local) · ?mpbc=nome (abas do mesmo navegador, sem WebRTC)
//   · ?mplag=ms&mpjit=ms (atraso artificial na chegada das mensagens, mantendo a ordem) · ?mpdebug=1..3 (log do PeerJS).
(() => {
'use strict';
let Q; try { Q = new URLSearchParams(location.search); } catch (e) { Q = new URLSearchParams(''); }
const SRV = Q.get('srv'), BCN = Q.get('mpbc');
const LAG = Math.max(0, +Q.get('mplag') || 0), JIT = Math.max(0, +Q.get('mpjit') || 0);
const PREFIX = 'galope-magico-sala-', VER = 1;
const PEER_SRC = (() => { try { const c = document.currentScript; return new URL('vendor/peerjs.min.js', (c && c.src) || location.href).href; } catch (e) { return 'vendor/peerjs.min.js'; } })();
const NETERR = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);
const RESERVED = new Set(['open', 'close', 'sync', 'error']);
const pnow = () => performance.now();
const median = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };
const sd = a => { if (a.length < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const err = (type, msg) => { const e = new Error(msg || type); e.type = type; return e; };
const evErr = e => ({ type: e.type, message: e.message });
const rid = () => Math.random().toString(36).slice(2, 10);
const code4 = () => String(1000 + Math.floor(Math.random() * 9000));
const clampAdj = v => Math.max(-1000, Math.min(1000, Math.round(+v || 0)));
const store = {
  get(k, d) { try { const v = localStorage.getItem('galope.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('galope.' + k, JSON.stringify(v)); } catch (e) {} }
};
const peerOpts = () => {
  const o = { debug: +Q.get('mpdebug') || 0 };
  if (SRV) { const [h, p] = SRV.split(':'); Object.assign(o, { host: h, port: +p || 9000, path: '/myapp', key: 'peerjs', secure: false }); }
  return o;
};

/* ---------- eventos ---------- */
const LS = new Map();   // tipo → funções (mensagens do app e os eventos open/close/sync/error)
function on(t, f) { let s = LS.get(t); if (!s) LS.set(t, s = new Set()); s.add(f); return () => { s.delete(f); }; }
function emit(t, d) { const s = LS.get(t); if (!s || !s.size) return; for (const f of Array.from(s)) try { f(d); } catch (e) { console.error(e); } }

/* ---------- sessão ---------- */
let S = null;   // sala atual (criada ou entrada); null = fora de sala
let OFF = 0;    // relógio da sala − relógio deste celular (ms); só vale em quem entrou
const live = s => !!s && s === S;
function session(role) {
  close();
  S = { role, code: '', open: false, tx: null, peer: null, conn: null, ch: null, id: rid(), pid: '',
        q: [], qT: 0, qTimer: 0, lastRx: 0, T: [], iv: [], pi: 0, n: 0, smp: [], wait: [] };
  NET.role = role; NET.code = ''; NET.open = NET.synced = false; NET.rtt = NET.prec = NaN; NET.link = ''; OFF = 0;
  return S;
}
// desfaz a sessão sem eventos (o fechamento real espera um pouco para o 'bye' sair)
function teardown(s) {
  if (S === s) S = null;
  s.dead = true; s.open = false; s.tx = null;
  for (const t of s.T) clearTimeout(t); for (const t of s.iv) clearInterval(t); clearTimeout(s.qTimer); s.q.length = 0; s.wait.length = 0;
  NET.open = false; NET.synced = false;
  const { conn, peer, ch } = s;
  setTimeout(() => { try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} try { ch && ch.close(); } catch (e) {} }, 150);
}
function resetFields() { NET.role = null; NET.code = ''; NET.rtt = NET.prec = NaN; NET.link = ''; OFF = 0; }
function close() {
  const s = S;
  if (s) { if (s.open && s.tx) s.tx({ t: 'net:bye' }); teardown(s); }
  calReset();
  resetFields();
}
function send(t, d) { const s = S; if (!s || !s.open || !s.tx) return false; s.tx(d === undefined ? { t } : { t, d }); return true; }

/* ---------- PeerJS ---------- */
let peerP = null;
function loadPeer() {
  if (!window.RTCPeerConnection) return Promise.reject(err('browser-incompatible'));
  if (window.Peer) return Promise.resolve();
  return peerP || (peerP = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PEER_SRC; sc.async = true;
    sc.onload = () => { if (window.Peer) res(); else { peerP = null; rej(err('browser-incompatible')); } };
    sc.onerror = () => { peerP = null; sc.remove(); rej(err('network', 'peerjs')); };
    (document.head || document.documentElement).appendChild(sc);
  }));
}
function mapErr(e) {
  const t = e && e.type;
  return err(t === 'peer-unavailable' || t === 'browser-incompatible' || t === 'timeout' ? t : NETERR.has(t) ? 'network' : (t || 'other'), e && e.message);
}

/* ---------- criar sala ---------- */
function host() {
  const s = session('host');
  return new Promise((res, rej) => {
    s.hres = res; s.hrej = rej;
    s.T.push(setTimeout(() => { if (s.hrej) hostFail(s, err('timeout')); }, 15000));
    if (BCN) bcHost(s, 0);
    else loadPeer().then(() => { if (live(s)) rtcHost(s, 0); }, e => hostFail(s, e));
  });
}
function hostOk(s, code) {
  if (!live(s) || !s.hres) return;
  s.code = NET.code = code; const r = s.hres; s.hres = s.hrej = null; r(code);
}
function hostFail(s, e) {
  if (!live(s)) return;
  const r = s.hrej; s.hres = s.hrej = null; teardown(s); resetFields();
  emit('error', evErr(e)); if (r) r(e);
}
function rtcHost(s, tries) {
  const code = code4(); let p;
  try { p = new window.Peer(PREFIX + code, peerOpts()); } catch (e) { return hostFail(s, mapErr(e)); }
  s.peer = p;
  p.on('open', () => { if (s.peer === p) hostOk(s, code); });
  p.on('connection', c => {
    if (!live(s) || s.peer !== p) { try { c.close(); } catch (e) {} return; }
    if (s.conn) { c.on('open', () => { try { c.send({ t: 'net:full', d: { why: 'full' } }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 400); }); return; }
    rtcBind(s, c);
  });
  p.on('error', e => {
    if (!live(s) || s.peer !== p) return;
    if (e.type === 'unavailable-id' && s.hrej && tries < 6) { s.peer = null; try { p.destroy(); } catch (x) {} rtcHost(s, tries + 1); return; }   // código em uso: outro
    if (s.hrej) hostFail(s, mapErr(e));
    else if (!s.open && (NETERR.has(e.type) || e.type === 'browser-incompatible')) emit('error', evErr(mapErr(e)));   // esperando e perdeu a sinalização
  });
  p.on('disconnected', () => { if (live(s) && s.peer === p && !s.open && !p.destroyed) try { p.reconnect(); } catch (e) {} });
}

/* ---------- entrar na sala ---------- */
function join(code) {
  const s = session('guest');
  code = String(code == null ? '' : code).replace(/\D/g, '');
  s.code = NET.code = code;
  return new Promise((res, rej) => {
    s.res = res; s.rej = rej;
    s.T.push(setTimeout(() => { if (!s.open) joinFail(s, err('timeout')); }, 20000));
    if (code.length !== 4) { s.T.push(setTimeout(() => joinFail(s, err('peer-unavailable')), 0)); return; }
    if (BCN) bcJoin(s, code);
    else loadPeer().then(() => { if (live(s)) rtcJoin(s, code); }, e => joinFail(s, e));
  });
}
function joinFail(s, e) {
  if (!live(s) || s.open) return;
  const r = s.rej; s.res = s.rej = null; teardown(s); resetFields();
  emit('error', evErr(e)); if (r) r(e);
}
function rtcJoin(s, code) {
  let p;
  try { p = new window.Peer(peerOpts()); } catch (e) { return joinFail(s, mapErr(e)); }
  s.peer = p;
  p.on('open', () => { if (live(s) && !s.conn) rtcBind(s, p.connect(PREFIX + code, { serialization: 'json', reliable: true })); });
  p.on('error', e => { if (live(s) && !s.open) joinFail(s, mapErr(e)); });
}
function rtcBind(s, c) {
  s.conn = c;
  c.on('open', () => {
    if (!live(s) || s.conn !== c) return;
    s.tx = m => { try { c.send(m); } catch (e) {} };
    if (s.role === 'guest') s.tx({ t: 'net:hello', d: { v: VER } });
    else s.T.push(setTimeout(() => { if (live(s) && s.conn === c && !s.open) dropCand(s); }, 6000));   // não se apresentou
  });
  c.on('data', m => { if (s.conn === c) rx(s, m); });
  c.on('close', () => { if (s.conn === c) lost(s, 'close'); });
  c.on('error', () => { if (s.conn === c) lost(s, 'error'); });
}
// sala esperando: o candidato caiu antes do aperto de mão; volta a esperar
function dropCand(s) {
  const c = s.conn; s.conn = null; s.tx = null; s.pid = '';
  if (c) setTimeout(() => { try { c.close(); } catch (e) {} }, 300);
}

/* ---------- transporte de teste: BroadcastChannel entre abas ---------- */
function bcChan(s) { const ch = new BroadcastChannel('galope-mp-' + BCN); s.ch = ch; ch.onmessage = e => bcRx(s, e.data); }
function bcPost(s, o) { try { s.ch.postMessage(JSON.stringify(o)); } catch (e) {} }   // JSON, como no PeerJS
function bcRx(s, raw) {
  if (!live(s)) return;
  let o; try { o = JSON.parse(raw); } catch (e) { return; }
  if (!o || (o.to && o.to !== s.id)) return;
  switch (o.k) {
    case 'probe': if (s.role === 'host' && s.code === o.code) bcPost(s, { k: 'taken', to: o.from }); return;
    case 'taken': s.taken = true; return;
    case 'knock':
      if (s.role !== 'host' || !s.code || s.code !== o.code) return;
      if (s.pid) { bcPost(s, { k: 'full', to: o.from }); return; }
      s.pid = o.from; s.tx = m => bcPost(s, { k: 'm', to: s.pid, from: s.id, m });
      bcPost(s, { k: 'ack', to: o.from, from: s.id });
      s.T.push(setTimeout(() => { if (live(s) && s.pid === o.from && !s.open) dropCand(s); }, 6000));
      return;
    case 'ack': if (s.role === 'guest' && !s.pid) { s.pid = o.from; s.tx = m => bcPost(s, { k: 'm', to: s.pid, from: s.id, m }); s.tx({ t: 'net:hello', d: { v: VER } }); } return;
    case 'full': if (s.role === 'guest' && !s.open) joinFail(s, err('full')); return;
    case 'm': if (s.pid && o.from === s.pid) rx(s, o.m); return;
  }
}
function bcHost(s, tries) {
  if (!s.ch) { if (typeof BroadcastChannel !== 'function') return hostFail(s, err('browser-incompatible')); bcChan(s); }
  const code = code4(); s.taken = false; bcPost(s, { k: 'probe', code, from: s.id });
  s.T.push(setTimeout(() => { if (!live(s)) return; if (s.taken && tries < 6) bcHost(s, tries + 1); else hostOk(s, code); }, 150));
}
function bcJoin(s, code) {
  if (typeof BroadcastChannel !== 'function') return joinFail(s, err('browser-incompatible'));
  bcChan(s); bcPost(s, { k: 'knock', code, from: s.id });
  s.T.push(setTimeout(() => { if (live(s) && !s.pid) joinFail(s, err('peer-unavailable')); }, 1000));
}

/* ---------- chegada das mensagens (com atraso artificial nos testes) ---------- */
function rx(s, m) {
  if (!live(s)) return;
  if (!LAG && !JIT) { handle(s, m); return; }
  let t = pnow() + LAG + Math.random() * JIT; if (t < s.qT) t = s.qT; s.qT = t;   // nunca passa à frente da anterior
  s.q.push(t, m); if (s.q.length === 2) qArm(s);
}
function qArm(s) { s.qTimer = setTimeout(() => qRun(s), Math.max(0, s.q[0] - pnow())); }
function qRun(s) {
  while (live(s) && s.q.length && s.q[0] <= pnow() + .5) { s.q.shift(); handle(s, s.q.shift()); }
  if (live(s) && s.q.length) qArm(s);
}
function handle(s, m) {
  if (!live(s) || !m || typeof m.t !== 'string') return;
  s.lastRx = pnow();
  const t = m.t, d = m.d;
  if (t.startsWith('net:')) { netMsg(s, t, d || {}); return; }
  if (!s.open) return;
  if (t.startsWith('cal:')) { calMsg(t, d || {}); return; }
  if (RESERVED.has(t)) return;
  emit(t, d);
}
function netMsg(s, t, d) {
  switch (t) {
    case 'net:ping': if (s.role === 'host' && s.open) s.tx({ t: 'net:pong', d: { i: d.i, a: d.a, b: pnow() } }); return;
    case 'net:pong': if (s.role === 'guest') sample(s, d); return;
    case 'net:sync':
      if (s.role === 'host') { NET.rtt = +d.rtt; NET.prec = +d.prec; const was = NET.synced; NET.synced = !!d.ok; if (NET.synced && !was) flushReady(s); emit('sync'); }
      return;
    case 'net:hello':
      if (s.role !== 'host' || s.open) return;
      if (d.v !== VER) { if (s.tx) s.tx({ t: 'net:full', d: { why: 'version' } }); dropCand(s); return; }
      s.tx({ t: 'net:welcome', d: { v: VER } }); setOpen(s); return;
    case 'net:welcome': if (s.role === 'guest' && !s.open) setOpen(s); return;
    case 'net:full': if (s.role === 'guest' && !s.open) joinFail(s, err(d.why === 'version' ? 'version' : 'full')); return;
    case 'net:bye': lost(s, 'bye'); return;
  }
}
function setOpen(s) {
  s.open = NET.open = true; s.lastRx = pnow();
  s.iv.push(setInterval(() => liveCheck(s), 1000));
  if (s.role === 'guest') {   // quem entrou mede o relógio da sala o tempo todo: rajada no começo, depois 4 vezes por segundo
    for (let i = 0; i < 12; i++) s.T.push(setTimeout(() => ping(s), i * 40));
    s.iv.push(setInterval(() => ping(s), 250));
  }
  linkCheck(s, 0);
  const r = s.res; s.res = s.rej = null;
  emit('open'); if (r) r();
}
// sem nada do outro lado por 6 s = conexão perdida (enquanto esta página está escondida não conta)
function liveCheck(s) { const n = pnow(); if (document.hidden) { s.lastRx = n; return; } if (n - s.lastRx > 6000) lost(s, 'timeout'); }
function lost(s, why) {
  if (!live(s)) return;
  if (!s.open) { if (s.role === 'guest') joinFail(s, err(why === 'bye' ? 'peer-unavailable' : 'network')); else dropCand(s); return; }
  teardown(s); calLost(); emit('close', { why });
}

/* ---------- relógio ---------- */
function ping(s) { if (live(s) && s.open) s.tx({ t: 'net:ping', d: { i: ++s.pi, a: pnow() } }); }
function sample(s, d) {
  const n = pnow(), a = +d.a, rtt = n - a, off = +d.b - (a + n) / 2;
  if (!(rtt >= 0) || !isFinite(off)) return;
  const smp = s.smp; smp.push({ rtt, off }); if (smp.length > 40) smp.shift();
  // as mensagens mais rápidas são as mais confiáveis: mediana dos 25% de menor ida e volta
  const best = smp.slice().sort((x, y) => x.rtt - y.rtt).slice(0, Math.max(3, smp.length >> 2));
  OFF = median(best.map(v => v.off)); NET.rtt = median(smp.map(v => v.rtt)); NET.prec = best[best.length - 1].rtt / 2;
  const was = NET.synced; if (smp.length >= 12) NET.synced = true;
  if (NET.synced && !was) flushReady(s);
  if (++s.n % 4 === 0 || NET.synced !== was) { s.tx({ t: 'net:sync', d: { rtt: NET.rtt, prec: NET.prec, ok: NET.synced } }); emit('sync'); }
}
function flushReady(s) { const w = s.wait.splice(0); for (const r of w) r(); }
const offNow = () => NET.role === 'guest' ? OFF : 0;

/* ---------- tipo de ligação (getStats, como connType em teste-dupla) ---------- */
function setLink(ty) { if (NET.link !== ty) { NET.link = ty; emit('sync'); } }
function linkCheck(s, k) {
  if (!live(s) || !s.open) return;
  if (s.ch) { setLink('local'); return; }
  const again = () => { if (live(s) && k < 8) s.T.push(setTimeout(() => linkCheck(s, k + 1), 1500)); };
  const pc = s.conn && s.conn.peerConnection;
  if (!pc || !pc.getStats) { again(); return; }
  pc.getStats().then(st => {
    if (!live(s)) return;
    let pair = null;
    st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); });
    if (!pair) st.forEach(r => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
    const lc = pair && st.get(pair.localCandidateId), rc = pair && st.get(pair.remoteCandidateId);
    const lt = lc && lc.candidateType, rt = rc && rc.candidateType;
    const ty = lt === 'relay' || rt === 'relay' ? 'relay' : lt === 'host' ? 'local' : lt === 'srflx' || lt === 'prflx' ? 'internet' : '';
    if (ty) setLink(ty); else again();
  }, again);
}

// a página vai embora: avisa o outro celular. Voltando a ficar visível: não conta o tempo escondida
addEventListener('pagehide', () => { const s = S; if (s && s.open && s.tx) { s.tx({ t: 'net:bye' }); lost(s, 'hide'); } });
document.addEventListener('visibilitychange', () => { if (S) S.lastRx = pnow(); });
document.addEventListener('resume', () => { if (S) S.lastRx = pnow(); });

const NET = window.NET = {
  role: null, code: '', open: false, synced: false, rtt: NaN, prec: NaN, link: '',
  adj: clampAdj(store.get('wifiAdj', 0)),   // ms somados ao horário do som deste celular
  host, join, close, send, on,
  now() { return pnow() + offNow(); },
  toLocal(sh) { return sh - offNow(); },
  toShared(l) { return l + offNow(); },
  ready() { if (NET.synced) return Promise.resolve(); const s = S; return new Promise(r => { if (s) s.wait.push(r); }); },
  // instante da sala (ms) → tempo do relógio do som em que a amostra precisa sair para ser OUVIDA nesse instante neste celular
  // (noAdj: sem o ajuste deste celular; a música só em quem criou a sala não usa o ajuste)
  ctxTime(ac, sh, noAdj) {
    ac = ac || C.ac; if (!ac) return NaN;
    const p = NET.toLocal(sh) + (noAdj ? 0 : NET.adj), n = pnow(), ts = ac.getOutputTimestamp ? ac.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0 && ts.contextTime > 0 && Math.abs(ts.performanceTime - n) < 2000) return ts.contextTime + (p - ts.performanceTime) / 1000;
    return ac.currentTime + (p - n) / 1000 - ((ac.outputLatency || 0) || (ac.baseLatency || 0));
  },
  setAdj(ms) { NET.adj = clampAdj(ms); store.set('wifiAdj', NET.adj); emit('sync'); }
};

/* ---------- CAL: medição pelo microfone ----------
   Cada celular toca 20 cliques, um a cada meio segundo, em tons diferentes (a sala 1800 Hz, quem entrou 3000 Hz), marcados
   no relógio da sala. O celular que mede grava e "dobra" a gravação no período de meio segundo: o que não se repete nesse
   ritmo some, e cada tom vira um pico nítido. A diferença entre os começos dos dois cliques é o atraso entre os celulares;
   quem entrou na sala corrige o seu som (adj −= diferença). */
const BEAT = .5, F_MEAS = [1800, 3000], N_MEAS = 20;
const C = { ac: null, out: null, wkAc: null, wk: null, wkOk: false, mic: null, rec: null, cur: null, L: new Set() };
const WORKLET = `
class Rec extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(8192); this.n = 0; this.on = true; this.port.onmessage = e => { if (e.data === 'stop') { if (this.n) this.port.postMessage(this.buf.slice(0, this.n)); this.on = false; } }; }
  process(inputs) {
    if (!this.on) return false;
    const x = inputs[0] && inputs[0][0], L = x ? x.length : 128;
    if (x) this.buf.set(x, this.n); else this.buf.fill(0, this.n, this.n + L);
    this.n += L; if (this.n >= 4096) { this.port.postMessage(this.buf.slice(0, this.n)); this.n = 0; }
    return true;
  }
}
registerProcessor('galope-rec', Rec);`;
function worklet(ac) {
  if (C.wkAc !== ac) {
    C.wkAc = ac; C.wkOk = false;
    C.wk = (ac.audioWorklet ? ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))).then(() => true) : Promise.resolve(false))
      .catch(() => false).then(ok => { if (C.wkAc === ac) C.wkOk = ok; return ok; });
  }
  return C.wk;
}
async function micStart() {
  const ac = C.ac;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw err('mic');
  if (ac.state !== 'running') try { await ac.resume(); } catch (e) {}
  if (!C.mic || C.mic.ac !== ac) {
    micRelease();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    C.mic = { ac, stream, src: ac.createMediaStreamSource(stream) };
  }
  await worklet(ac);
}
function micRelease() { const m = C.mic; C.mic = null; if (m) { try { m.src.disconnect(); } catch (e) {} m.stream.getTracks().forEach(t => t.stop()); } }
function recStart() {
  const ac = C.ac, m = C.mic; if (!ac || !m || C.rec) return;
  const R = { chunks: [], z: ac.createGain(), node: null }; R.z.gain.value = 0;
  if (C.wkOk) { R.node = new AudioWorkletNode(ac, 'galope-rec'); R.node.port.onmessage = e => R.chunks.push(e.data); }
  else { R.node = ac.createScriptProcessor(4096, 1, 1); R.node.onaudioprocess = e => R.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); }
  m.src.connect(R.node); R.node.connect(R.z).connect(ac.destination); C.rec = R;
}
function recStop() {
  const R = C.rec; C.rec = null; if (!R) return Promise.resolve(null);
  if (R.node.port) R.node.port.postMessage('stop');
  return new Promise(res => setTimeout(() => {
    try { R.node.disconnect(); R.z.disconnect(); } catch (e) {} if (!R.node.port) R.node.onaudioprocess = null;
    let n = 0; for (const c of R.chunks) n += c.length; const out = new Float32Array(n); let o = 0; for (const c of R.chunks) { out.set(c, o); o += c.length; } res(out);
  }, 150));
}
function resume(ac) { if (ac.state !== 'running') try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function out(ac) { if (!C.out || C.out.context !== ac) { C.out = ac.createGain(); C.out.gain.value = .9; C.out.connect(ac.destination); } return C.out; }
// clique de medição: tom curto com ataque seco
function tone(ac, t, f, list) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.95, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + .08);
  o.connect(g).connect(out(ac)); o.start(t); o.stop(t + .13); list.push(o);
}
function clicks(c) {
  const ac = C.ac; if (!ac || !NET.role) return;
  resume(ac);
  const f = F_MEAS[NET.role === 'host' ? 0 : 1], t0 = NET.ctxTime(ac, c.at);
  for (let k = 0; k < N_MEAS; k++) tone(ac, t0 + k * BEAT, f, c.osc);
}
// envelope de uma faixa estreita (dois passa-faixa de 300 Hz em série: o tom de um celular quase não vaza na faixa do outro)
function bandEnv(x, sr, fc) {
  const BW = 300, Qf = fc / BW, w = 2 * Math.PI * fc / sr, a = Math.sin(w) / (2 * Qf), a0 = 1 + a, b0 = a / a0, b2 = -a / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - a) / a0, rel = Math.exp(-1 / (.004 * sr));
  const env = new Float32Array(x.length), st = [[0, 0, 0, 0], [0, 0, 0, 0]]; let e = 0;
  for (let i = 0; i < x.length; i++) { let y = x[i]; for (const s of st) { const o = b0 * y + b2 * s[1] - a1 * s[2] - a2 * s[3]; s[1] = s[0]; s[0] = y; s[3] = s[2]; s[2] = o; y = o; } const v = Math.abs(y); e = v > e ? v : e * rel; env[i] = e; }
  return env;
}
function halfRise(arr, from, to, P, back) {   // começo do clique: do pico, volta até cair abaixo da metade (P: período circular; 0 = linear)
  const g = P ? i => arr[((i % P) + P) % P] : i => (i >= 0 && i < arr.length ? arr[i] : 0);
  from = Math.round(from); to = Math.round(to);
  let pk = 0, pi = from; for (let i = from; i < to; i++) { const v = g(i); if (v > pk) { pk = v; pi = i; } }
  for (let i = pi; i > pi - back; i--) if (g(i) < pk * .5) return { at: i + 1, pk };
  return { at: pi, pk };
}
const failRes = reason => ({ ok: false, diff: 0, spread: 0, n: 0, snr0: 0, snr1: 0, tonal: false, reason });
// diff = começo do clique de quem entrou − começo do clique da sala (ms); > 0: quem entrou soou depois
function analyze(x, sr) {
  const P = Math.round(BEAT * sr), nP = Math.floor(x.length / P); if (nP < 8) return failRes('quiet');
  const out = { ok: false, diff: 0, spread: 0, n: 0, snr0: 0, snr1: 0, tonal: false, reason: '' }, prof = [], on = [], md = [];
  for (let k = 0; k < 2; k++) {
    const env = bandEnv(x, sr, F_MEAS[k]), pr = new Float32Array(P);
    for (let i = 0; i < nP * P; i++) pr[i % P] += env[i];
    const r = halfRise(pr, 0, P, P, .12 * sr);
    md.push(median(Array.from(pr.filter((_, i) => i % 8 === 0)))); prof.push({ env, pr, pk: r.pk / nP, pp: r.pk }); on.push(r.at);
  }
  // o tom de um celular vaza um pouco na faixa do outro (3000 Hz deixa ~3% em 1800; 1800 deixa ~1,2% em 3000): esse vazamento
  // conta como ruído de fundo, senão o clique forte do próprio celular "aparece" como o clique do outro mesmo com ele mudo
  out.snr0 = prof[0].pp / Math.max(md[0], .5 * .03 * prof[1].pp, 1e-9);
  out.snr1 = prof[1].pp / Math.max(md[1], .5 * .012 * prof[0].pp, 1e-9);
  let d = on[1] - on[0]; d = ((d % P) + P) % P; if (d > P / 2) d -= P;
  out.diff = d / sr * 1000;
  // conferência de que são os cliques (tons puros) e não um barulho que pega todas as frequências: uma faixa no meio deve ficar fraca
  // (o clique mais forte vaza ~6 a 9% do seu pico nessa faixa: se ele cai na janela do outro, esse vazamento é descontado)
  { const env = bandEnv(x, sr, 2400), pr = new Float32Array(P); for (let i = 0; i < nP * P; i++) pr[i % P] += env[i];
    const near = o => { let m = 0; for (let i = 0; i < .03 * sr; i++) m = Math.max(m, pr[(((o + i) % P) + P) % P]); return m; };
    const pure = k => { let dj = (((on[1 - k] - on[k]) % P) + P) % P; if (dj > P / 2) dj -= P; return near(on[k]) < prof[k].pp * .35 + (dj > -.1 * sr && dj < .03 * sr ? prof[1 - k].pp * .12 : 0); };
    out.tonal = pure(0) && pure(1); }
  // conferência período a período (variação)
  const ds = [];
  for (let r = 0; r < nP; r++) {
    const a = halfRise(prof[0].env, r * P + on[0] - .02 * sr, r * P + on[0] + .06 * sr, 0, .03 * sr), b = halfRise(prof[1].env, r * P + on[0] + d - .02 * sr, r * P + on[0] + d + .06 * sr, 0, .03 * sr);
    if (a.pk > prof[0].pk * .3 && b.pk > prof[1].pk * .3) ds.push((b.at - a.at) / sr * 1000);   // só períodos com os dois cliques
  }
  const good = ds.filter(v => Math.abs(v - out.diff) < 15);
  out.n = Math.min(good.length, N_MEAS); out.spread = sd(good);
  out.ok = out.snr0 > 6 && out.snr1 > 6 && out.n >= 8 && out.tonal;
  out.reason = out.ok ? '' : out.snr0 > 6 && out.snr1 > 6 && !out.tonal ? 'noise' : 'quiet';
  return out;
}

// progresso nos dois celulares
function calEv(c, phase, r) {
  const e = { phase, listener: c.l, mine: !!c.mine, at: c.at, result: r || null, adj: NET.adj, applied: c.applied || 0 };
  for (const f of Array.from(C.L)) try { f(e); } catch (x) { console.error(x); }
}
function calClear(c) { for (const t of c.T) clearTimeout(t); c.T.length = 0; }
function calDone(c, r) {
  if (C.cur !== c) return;
  calClear(c); C.cur = null; CAL.busy = false;
  // o ajuste vai para quem entrou na sala (adianta ou atrasa o som dele)
  if (r && r.ok && NET.role === 'guest' && Math.abs(r.diff) >= 2) { const a0 = NET.adj; NET.setAdj(a0 - r.diff); c.applied = NET.adj - a0; }
  calEv(c, r && r.ok ? 'done' : 'fail', r);
  if (c.res) c.res(r);
}
function calPhases(c) {
  const n = pnow(), t0 = NET.toLocal(c.at), end = t0 + N_MEAS * BEAT * 1000 + 900;
  calEv(c, 'countdown');
  c.T.push(setTimeout(() => calEv(c, 'playing'), Math.max(0, t0 - n)));
  if (c.mine) c.T.push(setTimeout(recStart, Math.max(0, t0 - 600 - n)));
  c.T.push(setTimeout(() => {
    if (c.mine) { calFinish(c); return; }
    calEv(c, 'analyzing'); c.T.push(setTimeout(() => calDone(c, failRes('net')), 12000));   // o resultado não chegou
  }, Math.max(0, end - n)));
}
async function calFinish(c) {
  if (C.cur !== c) return;
  calEv(c, 'analyzing');
  const x = await recStop(); micRelease();
  if (C.cur !== c) return;
  let r = null; try { if (x && x.length) r = analyze(x, C.ac.sampleRate); } catch (e) { console.error(e); }
  if (!r) r = failRes('quiet');
  send('cal:res', { id: c.id, r });
  calDone(c, r);
}
async function calRun(c) {
  const gone = () => { micRelease(); if (c.yielded) c.rej(err('busy')); };   // cedeu à medição do outro celular, ou saiu da sala
  calEv(c, 'mic'); send('cal:mic', { id: c.id, l: c.l });
  try { await micStart(); }
  catch (e) {
    if (C.cur !== c) { gone(); return; }
    const r = failRes('mic'); send('cal:res', { id: c.id, r }); calClear(c); C.cur = null; CAL.busy = false; calEv(c, 'fail', r);
    c.rej(err('mic', e && e.message)); return;
  }
  if (C.cur !== c) { gone(); return; }
  if (NET.open && !NET.synced) await Promise.race([NET.ready(), new Promise(r => setTimeout(r, 6000))]);
  if (C.cur !== c) { gone(); return; }
  if (!NET.open || !NET.synced) { const r = failRes('net'); micRelease(); send('cal:res', { id: c.id, r }); calDone(c, r); return; }
  c.at = NET.now() + 2600;
  send('cal:go', { id: c.id, at: c.at, l: c.l });
  clicks(c); calPhases(c);
}
function calMsg(t, d) {
  let c = C.cur;
  if (t === 'cal:mic') {
    if (c && c.mine) {
      if (NET.role === 'host') return;   // os dois pediram juntos: vale a medição de quem criou a sala
      c.yielded = true; calStop(c); if (c.at > 0) { micRelease(); c.rej(err('busy')); }
    } else if (c) calStop(c);
    c = C.cur = { id: d.id, l: d.l, mine: false, at: NaN, T: [], osc: [], applied: 0 }; CAL.busy = true;
    c.T.push(setTimeout(() => { if (C.cur === c && !(c.at > 0)) calDone(c, failRes('net')); }, 60000));
    calEv(c, 'mic');
  } else if (t === 'cal:go') {
    if (c && c.mine) return;
    if (!c || c.id !== d.id) { if (c) calStop(c); c = C.cur = { id: d.id, l: d.l, mine: false, at: NaN, T: [], osc: [], applied: 0 }; CAL.busy = true; }
    calClear(c); c.at = +d.at; clicks(c); calPhases(c);
  } else if (t === 'cal:res') {
    if (c && !c.mine && c.id === d.id) calDone(c, d.r || failRes('quiet'));
  }
}
// conexão caiu: quem só tocava não vai receber o resultado; quem mede termina sozinho
function calLost() { const c = C.cur; if (c && !c.mine) calDone(c, failRes('net')); }
// saída local da sala: para tudo sem eventos
function calStop(c) {
  calClear(c); for (const o of c.osc) try { o.stop(); } catch (e) {} c.osc.length = 0;
  if (c.mine) { const R = C.rec; C.rec = null; if (R) try { R.node.disconnect(); R.z.disconnect(); } catch (e) {} }
}
function calReset() {
  const c = C.cur; if (!c) return;
  calStop(c); if (c.mine) micRelease();
  C.cur = null; CAL.busy = false;
}

const CAL = window.CAL = {
  busy: false,
  attach(ac) { if (ac && ac !== C.ac) { C.ac = ac; C.out = null; } },
  measure() {
    if (CAL.busy) return Promise.reject(err('busy'));
    if (!NET.open) return Promise.reject(err('closed'));
    if (!C.ac) return Promise.reject(err('audio'));
    const c = { id: rid(), l: NET.role, mine: true, at: NaN, T: [], osc: [], applied: 0 };
    C.cur = c; CAL.busy = true;
    return new Promise((res, rej) => { c.res = res; c.rej = rej; calRun(c); });
  },
  on(fn) { C.L.add(fn); return () => { C.L.delete(fn); }; },
  analyze
};
})();
