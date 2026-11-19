import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jugador } from '../core/Jugador.ts';
import { Partida } from '../core/Partida.ts';
import { ErrorContrato, FabricaEventos } from './FabricaEventos.ts';

const partida = () => new Partida('connect4', [new Jugador('Omar'), Jugador.computadora()], 'm-1');

test('arma un evento con todos los campos que exige GameStats', () => {
  const ahora = new Date('2026-11-18T19:40:00.123Z');
  const e = FabricaEventos.crear(
    partida(),
    'MOVE',
    { column: 3, row: 5, piece: 'R', moveNumber: 1 },
    'omar',
    ahora,
  );
  assert.match(e.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(e.timestamp, '2026-11-18T19:40:00.123Z');
  assert.equal(e.gameId, 'connect4');
  assert.equal(e.gameVersion, '1.0');
  assert.equal(e.matchId, 'm-1');
  assert.equal(e.playerId, 'omar');
  assert.equal(e.type, 'MOVE');
  assert.deepEqual(e.data, { column: 3, row: 5, piece: 'R', moveNumber: 1 });
});

test('cada evento tiene un eventId distinto', () => {
  const p = partida();
  const ids = new Set(
    Array.from({ length: 50 }, () => FabricaEventos.crear(p, 'PLAYER_JOINED', {}, 'omar').eventId),
  );
  assert.equal(ids.size, 50);
});

test('sin playerId no se incluye el campo (MATCH_STARTED)', () => {
  const e = FabricaEventos.crear(partida(), 'MATCH_STARTED', { players: ['omar', 'cpu'], difficulty: 'hard' });
  assert.equal('playerId' in e, false);
});

test('rechaza un tipo que no existe en el juego', () => {
  assert.throws(() => FabricaEventos.crear(partida(), 'TELEPORT', {}, 'omar'), ErrorContrato);
});

test('rechaza si falta un campo obligatorio de data', () => {
  assert.throws(
    () => FabricaEventos.crear(partida(), 'MOVE', { column: 3, row: 5, piece: 'R' }, 'omar'),
    /falta data.moveNumber/,
  );
});

test('rechaza si falta playerId donde es obligatorio', () => {
  assert.throws(
    () => FabricaEventos.crear(partida(), 'MOVE', { column: 3, row: 5, piece: 'R', moveNumber: 1 }),
    /requiere playerId/,
  );
});

test('rechaza valores que Scala descartaría: booleanos, objetos, listas de números, NaN', () => {
  const p = partida();
  const base = { players: ['omar'], difficulty: 'hard' };
  for (const malo of [true, { a: 1 }, [1, 2], Number.NaN]) {
    assert.throws(
      () => FabricaEventos.crear(p, 'MATCH_STARTED', { ...base, extra: malo as never }),
      /solo se permite texto, número o lista de textos/,
    );
  }
});

test('rechaza un juego sin contrato', () => {
  const p = new Partida('ajedrez', [new Jugador('Omar')]);
  assert.throws(() => FabricaEventos.crear(p, 'MATCH_STARTED', {}), /no tiene contrato/);
});
