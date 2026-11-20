// La copia del contrato en TypeScript debe ser idéntica a games/<juego>.json, que es lo
// que valida Go. Si alguien cambia uno y no el otro, esta prueba falla.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONTRATO } from './contrato.ts';

const carpetaGames = new URL('../../../games/', import.meta.url);

for (const gameId of Object.keys(CONTRATO)) {
  test(`el contrato de ${gameId} coincide con games/${gameId}.json`, () => {
    const real = JSON.parse(readFileSync(new URL(`${gameId}.json`, carpetaGames), 'utf8'));
    assert.equal(real.gameId, gameId);
    assert.deepEqual([...CONTRATO[gameId].playerRequired].sort(), [...real.playerRequired].sort());
    assert.deepEqual(CONTRATO[gameId].types, real.types);
  });
}
