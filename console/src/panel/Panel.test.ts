import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClienteGameStats } from './ClienteGameStats.ts';
import { ETIQUETAS_GENERALES, ETIQUETAS_POR_JUEGO, filas, formatear } from './etiquetas.ts';

test('el panel muestra los valores tal como llegan de GameStats, solo con nombre y formato', () => {
  const general = { totalMatches: 12, avgDurationSeconds: 45.5, mostPlayedGame: 'snake', distinctPlayers: 2 };
  assert.deepEqual(filas(general, ETIQUETAS_GENERALES), [
    { clave: 'totalMatches', etiqueta: 'Partidas analizadas', valor: '12' },
    { clave: 'distinctPlayers', etiqueta: 'Jugadores distintos', valor: '2' },
    { clave: 'avgDurationSeconds', etiqueta: 'Duración promedio (s)', valor: '45,5' },
    { clave: 'mostPlayedGame', etiqueta: 'Juego más jugado', valor: 'Culebrita' },
  ]);
});

test('lo que GameStats agregue sin etiqueta se muestra igual, al final, y nunca el gameId', () => {
  const resumen = { gameId: 'connect4', matches: 3, nuevaMetrica: 7, humanWins: 1 };
  const r = filas(resumen, ETIQUETAS_POR_JUEGO.connect4);
  assert.deepEqual(r.map((f) => f.clave), ['matches', 'humanWins', 'nuevaMetrica']);
  assert.equal(r[2].etiqueta, 'nuevaMetrica');
});

test('una estadística que GameStats omite no aparece (no se inventa un 0)', () => {
  const r = filas({ matches: 0 }, ETIQUETAS_POR_JUEGO.snake);
  assert.deepEqual(r.map((f) => f.clave), ['matches']);
});

test('formato: números con a lo más 2 decimales; textos sin cambios', () => {
  assert.equal(formatear('x', 1234.567), '1234,57'.replace('1234', (1234).toLocaleString('es')));
  assert.equal(formatear('result', 'LOSS'), 'LOSS');
});

test('el cliente consulta las rutas del proxy y avisa si un servicio falla', async () => {
  const pedidas: string[] = [];
  const cliente = new ClienteGameStats(async (url) => {
    pedidas.push(url);
    if (url.endsWith('/matches')) return { ok: false, status: 502, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ total: 0, games: [], general: {} }) };
  });
  await cliente.panorama();
  await cliente.instancias();
  await assert.rejects(cliente.partidas(), /502/);
  assert.deepEqual(pedidas, ['/api/stats/stats', '/api/ingest/instances', '/api/ingest/matches']);
});
