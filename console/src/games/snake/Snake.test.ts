import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jugador } from '../../core/Jugador.ts';
import { Partida } from '../../core/Partida.ts';
import type { Evento, ReceptorEventos } from '../../events/tipos.ts';
import { type CausaMuerte, JuegoSnake, type VistaJuegoSnake } from './JuegoSnake.ts';
import { Serpiente } from './Serpiente.ts';

// ---------- Serpiente ----------

test('la serpiente empieza con 3 segmentos mirando a la derecha', () => {
  const s = new Serpiente(10, 10);
  assert.deepEqual(s.cuerpo, [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  assert.equal(s.direccion, 'DERECHA');
});

test('mover sin crecer conserva la longitud; creciendo, suma uno', () => {
  const s = new Serpiente(10, 10);
  s.mover(false);
  assert.deepEqual(s.cabeza, { x: 11, y: 10 });
  assert.equal(s.longitud, 3);
  s.mover(true);
  assert.equal(s.longitud, 4);
});

test('no se puede dar media vuelta', () => {
  const s = new Serpiente(10, 10);
  s.cambiarDireccion('IZQUIERDA');
  assert.equal(s.direccion, 'DERECHA');
  s.cambiarDireccion('ARRIBA');
  assert.equal(s.direccion, 'ARRIBA');
});

test('choca consigo misma al dar la vuelta siendo larga', () => {
  const s = new Serpiente(10, 10);
  s.mover(true);
  s.mover(true); // longitud 5
  for (const d of ['ABAJO', 'IZQUIERDA', 'ARRIBA'] as const) {
    assert.equal(s.chocoConsigo(), false);
    s.cambiarDireccion(d);
    s.mover(false);
  }
  assert.equal(s.chocoConsigo(), true);
});

// ---------- JuegoSnake ----------

class ReceptorFalso implements ReceptorEventos {
  readonly eventos: Evento[] = [];
  publicar(e: Evento): void {
    this.eventos.push(e);
  }
  tipos(): string[] {
    return this.eventos.map((e) => e.type);
  }
}

class VistaFalsa implements VistaJuegoSnake {
  final: { puntaje: number; longitud: number; causa: CausaMuerte } | null = null;
  dibujar(): void {}
  mostrarFinal(puntaje: number, longitud: number, causa: CausaMuerte): void {
    this.final = { puntaje, longitud, causa };
  }
  destruir(): void {}
}

// "Azar" fijo: devuelve los valores de la lista en orden y después 0.
// Cada comida usa dos valores: x = floor(v * 20), y = floor(v * 20).
function preparar(azar: number[]) {
  const valores = [...azar];
  const receptor = new ReceptorFalso();
  const vista = new VistaFalsa();
  const juego = new JuegoSnake(new Partida('snake', [new Jugador('Omar')]), receptor, {
    aleatorio: () => valores.shift() ?? 0,
    crearVista: () => vista,
    usarReloj: false,
  });
  juego.comenzar({} as HTMLElement);
  return { juego, receptor, vista };
}

test('no se mueve hasta la primera tecla', () => {
  const { juego } = preparar([]);
  juego.paso();
  assert.deepEqual(juego.serpiente.cabeza, { x: 10, y: 10 });
  juego.cambiarDireccion('DERECHA');
  juego.paso();
  assert.deepEqual(juego.serpiente.cabeza, { x: 11, y: 10 });
});

test('la comida nunca aparece encima de la serpiente', () => {
  const { juego } = preparar([0.5, 0.5]); // (10,10) es la cabeza: se descarta y sale (0,0)
  assert.deepEqual(juego.comida, { x: 0, y: 0 });
});

test('comer suma 10, crece y emite FOOD_EATEN', () => {
  const { juego, receptor } = preparar([0.56, 0.51]); // comida en (11,10), justo enfrente
  juego.cambiarDireccion('DERECHA');
  juego.paso();
  assert.equal(juego.puntaje, 10);
  assert.equal(juego.serpiente.longitud, 4);
  const comida = receptor.eventos.find((e) => e.type === 'FOOD_EATEN')!;
  assert.equal(comida.playerId, 'omar');
  assert.deepEqual(comida.data, { score: 10, length: 4 });
});

test('chocar con la pared emite PLAYER_DIED (wall) y termina con LOSS', () => {
  const { juego, receptor, vista } = preparar([]); // comida en (0,0), lejos
  juego.cambiarDireccion('DERECHA');
  for (let i = 0; i < 10; i++) juego.paso(); // de x=10 a x=20: fuera del tablero
  assert.equal(juego.enCurso, false);
  assert.deepEqual(receptor.tipos(), ['MATCH_STARTED', 'PLAYER_JOINED', 'PLAYER_DIED', 'MATCH_FINISHED']);
  assert.deepEqual(receptor.eventos[0].data, { players: ['omar'], gridSize: 20 });
  assert.deepEqual(receptor.eventos[2].data, { cause: 'wall', score: 0, length: 3 });
  assert.deepEqual(receptor.eventos[3].data, { result: 'LOSS' });
  assert.deepEqual(vista.final, { puntaje: 0, longitud: 3, causa: 'wall' });
  juego.paso(); // ya terminó: no pasa nada
  assert.equal(receptor.eventos.length, 4);
});

test('morderse la cola emite PLAYER_DIED (self)', () => {
  // Comidas en (11,10) y (12,10): crece a 5 y luego da la vuelta sobre sí misma.
  const { juego, receptor } = preparar([0.56, 0.51, 0.61, 0.51]);
  juego.cambiarDireccion('DERECHA');
  juego.paso();
  juego.paso();
  for (const d of ['ABAJO', 'IZQUIERDA', 'ARRIBA'] as const) {
    juego.cambiarDireccion(d);
    juego.paso();
  }
  const muerte = receptor.eventos.find((e) => e.type === 'PLAYER_DIED')!;
  assert.deepEqual(muerte.data, { cause: 'self', score: 20, length: 5 });
  assert.equal(juego.enCurso, false);
});

test('ignora la media vuelta y solo un cambio de dirección por paso', () => {
  const { juego } = preparar([]);
  juego.cambiarDireccion('IZQUIERDA'); // hacia atrás: se ignora, pero arranca
  juego.paso();
  assert.deepEqual(juego.serpiente.cabeza, { x: 11, y: 10 });
  juego.cambiarDireccion('ARRIBA');
  juego.cambiarDireccion('IZQUIERDA'); // segundo cambio en el mismo paso: se ignora
  juego.paso();
  assert.deepEqual(juego.serpiente.cabeza, { x: 11, y: 9 });
});

test('dos culebritas a la vez son independientes', () => {
  const a = preparar([]);
  const b = preparar([]);
  a.juego.cambiarDireccion('DERECHA');
  a.juego.paso();
  assert.deepEqual(b.juego.serpiente.cabeza, { x: 10, y: 10 });
  assert.notEqual(a.juego.matchId, b.juego.matchId);
});
