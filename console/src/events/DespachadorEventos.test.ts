import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DespachadorEventos, type Respuesta, type Transporte } from './DespachadorEventos.ts';
import type { Evento } from './tipos.ts';

let contador = 0;
const ev = (matchId: string, type: string): Evento => ({
  eventId: `e-${++contador}`,
  timestamp: new Date().toISOString(),
  gameId: 'snake',
  gameVersion: '1.0',
  matchId,
  type,
  data: {},
});

const pausa = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const sinEspera = async () => {};
const silencio = () => {};

// Un "Go" falso que anota lo que recibe y responde lo que le digan.
function goFalso(responder: (e: Evento, n: number) => Respuesta | Promise<Respuesta> | 'caido') {
  const recibidos: Evento[] = [];
  let n = 0;
  const transporte: Transporte = async (_url, cuerpo) => {
    const e = JSON.parse(cuerpo) as Evento;
    const r = await responder(e, ++n);
    if (r === 'caido') throw new Error('ECONNREFUSED');
    recibidos.push(e);
    return r;
  };
  return { transporte, recibidos };
}

const ok: Respuesta = { status: 202, texto: '{"status":"accepted"}' };

test('respeta el orden de los eventos dentro de una partida', async () => {
  // Respuestas con demoras al azar: aun así el orden de llegada debe ser el de publicación.
  const go = goFalso(async () => {
    await pausa(Math.random() * 5);
    return ok;
  });
  const d = new DespachadorEventos({ transporte: go.transporte, esperar: sinEspera });
  const tipos = ['MATCH_STARTED', 'PLAYER_JOINED', 'FOOD_EATEN', 'FOOD_EATEN', 'PLAYER_DIED', 'MATCH_FINISHED'];
  for (const t of tipos) d.publicar(ev('A', t));
  await d.esperarTodo();
  assert.deepEqual(go.recibidos.map((e) => e.type), tipos);
  assert.deepEqual(d.estado('A'), { enviados: 6, pendientes: 0, descartados: 0, reintentos: 0, ultimoError: null });
});

test('una partida lenta no frena a las demás', async () => {
  const go = goFalso(async (e) => {
    await pausa(e.matchId === 'LENTA' ? 40 : 1);
    return ok;
  });
  const d = new DespachadorEventos({ transporte: go.transporte, esperar: sinEspera });
  for (let i = 0; i < 3; i++) d.publicar(ev('LENTA', 'FOOD_EATEN'));
  for (let i = 0; i < 3; i++) d.publicar(ev('RAPIDA', 'FOOD_EATEN'));
  await d.esperarTodo();
  const rapidaTermino = go.recibidos.findLastIndex((e) => e.matchId === 'RAPIDA');
  const lentaTermino = go.recibidos.findLastIndex((e) => e.matchId === 'LENTA');
  assert.ok(rapidaTermino < lentaTermino, 'la partida rápida debía terminar primero');
});

test('las partidas se envían en paralelo: el total tarda como la más lenta, no la suma', async () => {
  const go = goFalso(async () => {
    await pausa(30);
    return ok;
  });
  const d = new DespachadorEventos({ transporte: go.transporte, esperar: sinEspera });
  const inicio = Date.now();
  for (const m of ['A', 'B', 'C', 'D', 'E']) d.publicar(ev(m, 'MATCH_STARTED'));
  await d.esperarTodo();
  assert.ok(Date.now() - inicio < 120, `tardó ${Date.now() - inicio} ms; en serie serían 150`);
});

test('si GameStats está caído, reintenta el mismo evento con espera creciente y no pierde el orden', async () => {
  const esperas: number[] = [];
  const go = goFalso((_e, n) => (n <= 3 ? 'caido' : ok));
  const d = new DespachadorEventos({
    transporte: go.transporte,
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
  d.publicar(ev('A', 'MATCH_STARTED'));
  d.publicar(ev('A', 'FOOD_EATEN'));
  await d.esperarTodo();
  assert.deepEqual(esperas, [500, 1000, 2000]);
  assert.deepEqual(go.recibidos.map((e) => e.type), ['MATCH_STARTED', 'FOOD_EATEN']);
  const estado = d.estado('A');
  assert.equal(estado.enviados, 2);
  assert.equal(estado.reintentos, 3);
});

test('la espera entre reintentos no pasa del máximo', async () => {
  const esperas: number[] = [];
  const go = goFalso((_e, n) => (n <= 8 ? { status: 503, texto: '' } : ok));
  const d = new DespachadorEventos({
    transporte: go.transporte,
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
  d.publicar(ev('A', 'MATCH_STARTED'));
  await d.esperarTodo();
  assert.equal(Math.max(...esperas), 10_000);
});

test('un 400 por eventId repetido cuenta como enviado (el intento anterior sí llegó)', async () => {
  const go = goFalso(() => ({ status: 400, texto: '{"error":"eventId \\"e-1\\" repetido"}' }));
  const d = new DespachadorEventos({ transporte: go.transporte, esperar: sinEspera, registrar: silencio });
  d.publicar(ev('A', 'MATCH_STARTED'));
  await d.esperarTodo();
  assert.equal(d.estado('A').enviados, 1);
  assert.equal(d.estado('A').descartados, 0);
});

test('un 400 por otro motivo se descarta sin reintentar y la cola sigue', async () => {
  const mensajes: string[] = [];
  const go = goFalso((e) =>
    e.type === 'FOOD_EATEN' ? { status: 400, texto: '{"error":"falta data.score"}' } : ok,
  );
  const d = new DespachadorEventos({
    transporte: go.transporte,
    esperar: sinEspera,
    registrar: (m) => mensajes.push(m),
  });
  d.publicar(ev('A', 'MATCH_STARTED'));
  d.publicar(ev('A', 'FOOD_EATEN'));
  d.publicar(ev('A', 'MATCH_FINISHED'));
  await d.esperarTodo();
  assert.deepEqual(go.recibidos.map((e) => e.type), ['MATCH_STARTED', 'FOOD_EATEN', 'MATCH_FINISHED']);
  const estado = d.estado('A');
  assert.equal(estado.enviados, 2);
  assert.equal(estado.descartados, 1);
  assert.equal(estado.reintentos, 0);
  assert.match(estado.ultimoError ?? '', /falta data.score/);
  assert.equal(mensajes.length, 1);
});

test('publicar no espera a la red y avisa a los suscriptores', async () => {
  let liberar!: () => void;
  const bloqueo = new Promise<void>((ok) => (liberar = ok));
  const go = goFalso(async () => {
    await bloqueo;
    return ok;
  });
  const d = new DespachadorEventos({ transporte: go.transporte, esperar: sinEspera });
  const avisos: number[] = [];
  d.suscribir((_m, e) => avisos.push(e.pendientes));
  d.publicar(ev('A', 'MATCH_STARTED')); // regresa aunque "Go" todavía no responde
  d.publicar(ev('A', 'PLAYER_JOINED'));
  assert.equal(d.totales().pendientes, 2);
  liberar();
  await d.esperarTodo();
  assert.equal(d.totales().pendientes, 0);
  assert.deepEqual(avisos, [1, 2, 1, 0]);
});
