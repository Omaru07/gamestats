import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPUTADORA, JUGADOR, TableroConecta4 } from './TableroConecta4.ts';

test('las fichas caen por gravedad: la primera queda en la fila de abajo (5)', () => {
  const t = new TableroConecta4();
  assert.equal(t.colocarFicha(3, JUGADOR), 5);
  assert.equal(t.colocarFicha(3, COMPUTADORA), 4);
  assert.equal(t.celda(5, 3), JUGADOR);
  assert.equal(t.celda(4, 3), COMPUTADORA);
});

test('una columna llena devuelve -1 y deja de ser válida', () => {
  const t = new TableroConecta4();
  for (let i = 0; i < 6; i++) t.colocarFicha(0, i % 2 === 0 ? JUGADOR : COMPUTADORA);
  assert.equal(t.colocarFicha(0, JUGADOR), -1);
  assert.equal(t.columnaValida(0), false);
  assert.equal(t.columnaValida(1), true);
  assert.equal(t.columnaValida(7), false);
  assert.equal(t.colocarFicha(-1, JUGADOR), -1);
});

test('gana en horizontal y devuelve la línea completa', () => {
  const t = new TableroConecta4();
  for (const c of [0, 1, 2]) t.colocarFicha(c, JUGADOR);
  const fila = t.colocarFicha(3, JUGADOR);
  assert.deepEqual(t.lineaGanadora(fila, 3, JUGADOR), [[5, 0], [5, 1], [5, 2], [5, 3]]);
});

test('gana en vertical', () => {
  const t = new TableroConecta4();
  let fila = -1;
  for (let i = 0; i < 4; i++) fila = t.colocarFicha(6, COMPUTADORA);
  assert.equal(t.verificarGanador(fila, 6, COMPUTADORA), true);
});

test('gana en las dos diagonales', () => {
  // Diagonal que sube hacia la derecha: (5,0) (4,1) (3,2) (2,3)
  const t = new TableroConecta4();
  t.colocarFicha(0, JUGADOR);
  t.colocarFicha(1, COMPUTADORA);
  t.colocarFicha(1, JUGADOR);
  t.colocarFicha(2, COMPUTADORA);
  t.colocarFicha(2, COMPUTADORA);
  t.colocarFicha(2, JUGADOR);
  for (let i = 0; i < 3; i++) t.colocarFicha(3, COMPUTADORA);
  const fila = t.colocarFicha(3, JUGADOR);
  assert.equal(t.verificarGanador(fila, 3, JUGADOR), true);

  // Diagonal que baja hacia la derecha: (2,3) (3,4) (4,5) (5,6)
  const u = new TableroConecta4();
  u.colocarFicha(6, JUGADOR);
  u.colocarFicha(5, COMPUTADORA);
  u.colocarFicha(5, JUGADOR);
  u.colocarFicha(4, COMPUTADORA);
  u.colocarFicha(4, COMPUTADORA);
  u.colocarFicha(4, JUGADOR);
  for (let i = 0; i < 3; i++) u.colocarFicha(3, COMPUTADORA);
  const f2 = u.colocarFicha(3, JUGADOR);
  assert.equal(u.verificarGanador(f2, 3, JUGADOR), true);
});

test('tres en línea no gana', () => {
  const t = new TableroConecta4();
  for (const c of [0, 1]) t.colocarFicha(c, JUGADOR);
  const fila = t.colocarFicha(2, JUGADOR);
  assert.equal(t.verificarGanador(fila, 2, JUGADOR), false);
});

test('tablero lleno', () => {
  const t = new TableroConecta4();
  assert.equal(t.tableroLleno(), false);
  for (let c = 0; c < 7; c++) for (let i = 0; i < 6; i++) t.colocarFicha(c, JUGADOR);
  assert.equal(t.tableroLleno(), true);
});

test('aTexto usa el formato de la IA en Prolog: 42 casillas, fila de arriba primero', () => {
  const t = new TableroConecta4();
  t.colocarFicha(0, JUGADOR); // abajo a la izquierda: posición 5*7 + 0 = 35
  t.colocarFicha(6, COMPUTADORA); // abajo a la derecha: posición 41
  const texto = t.aTexto();
  assert.equal(texto.length, 42);
  assert.equal(texto[35], 'R');
  assert.equal(texto[41], 'Y');
  assert.equal(texto.replace(/[RY]/g, '').length, 40);
  assert.match(texto, /^\.{35}R\.{5}Y$/);
});
