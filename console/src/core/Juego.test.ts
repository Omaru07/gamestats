import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatosEvento, Evento, ReceptorEventos } from '../events/tipos.ts';
import { Juego } from './Juego.ts';
import { Jugador } from './Jugador.ts';
import { Partida } from './Partida.ts';
import { RegistroJuegos } from './RegistroJuegos.ts';

class ReceptorFalso implements ReceptorEventos {
  readonly eventos: Evento[] = [];
  publicar(evento: Evento): void {
    this.eventos.push(evento);
  }
  tipos(): string[] {
    return this.eventos.map((e) => e.type);
  }
}

// Un juego mínimo para probar la clase base: come una vez y muere.
class JuegoDePrueba extends Juego {
  montado = false;
  desmontado = 0;
  protected datosDeInicio(): DatosEvento {
    return { gridSize: 20 };
  }
  protected montar(): void {
    this.montado = true;
  }
  protected desmontar(): void {
    this.desmontado++;
  }
  comer(): void {
    this.emitir('FOOD_EATEN', { score: 10, length: 4 }, this.partida.humano.id);
  }
  morir(): void {
    this.emitir('PLAYER_DIED', { cause: 'wall', score: 10, length: 4 }, this.partida.humano.id);
    this.terminar('LOSS');
  }
}

const contenedor = {} as HTMLElement;
const nuevo = (r: ReceptorEventos) => new JuegoDePrueba(new Partida('snake', [new Jugador('Omar')]), r);

test('comenzar emite MATCH_STARTED y un PLAYER_JOINED por jugador, y monta la vista', () => {
  const r = new ReceptorFalso();
  const j = nuevo(r);
  j.comenzar(contenedor);
  assert.deepEqual(r.tipos(), ['MATCH_STARTED', 'PLAYER_JOINED']);
  assert.deepEqual(r.eventos[0].data, { players: ['omar'], gridSize: 20 });
  assert.equal(r.eventos[1].playerId, 'omar');
  assert.equal(j.montado, true);
});

test('no se puede comenzar dos veces la misma partida', () => {
  const j = nuevo(new ReceptorFalso());
  j.comenzar(contenedor);
  assert.throws(() => j.comenzar(contenedor), /ya comenzó/);
});

test('terminar emite MATCH_FINISHED, cierra la partida y avisa; después ya no emite nada', () => {
  const r = new ReceptorFalso();
  const j = nuevo(r);
  let avisado = 0;
  j.alTerminar(() => avisado++);
  j.comenzar(contenedor);
  j.comer();
  j.morir();
  j.comer(); // ya terminó: se ignora
  assert.deepEqual(r.tipos(), ['MATCH_STARTED', 'PLAYER_JOINED', 'FOOD_EATEN', 'PLAYER_DIED', 'MATCH_FINISHED']);
  assert.deepEqual(r.eventos.at(-1)?.data, { result: 'LOSS' });
  assert.equal(j.enCurso, false);
  assert.equal(j.resultado, 'LOSS');
  assert.equal(avisado, 1);
});

test('cerrar una partida en curso la marca ABANDONED; cerrar una terminada solo desmonta', () => {
  const r = new ReceptorFalso();
  const j = nuevo(r);
  j.comenzar(contenedor);
  j.cerrar();
  assert.deepEqual(r.eventos.at(-1)?.data, { result: 'ABANDONED' });
  assert.equal(j.desmontado, 1);

  const r2 = new ReceptorFalso();
  const j2 = nuevo(r2);
  j2.comenzar(contenedor);
  j2.morir();
  j2.cerrar();
  assert.equal(r2.tipos().filter((t) => t === 'MATCH_FINISHED').length, 1);
  assert.equal(j2.desmontado, 1);
});

test('eventoDeAbandono arma el MATCH_FINISHED sin encolarlo, y solo una vez', () => {
  const r = new ReceptorFalso();
  const j = nuevo(r);
  j.comenzar(contenedor);
  const e = j.eventoDeAbandono();
  assert.equal(e?.type, 'MATCH_FINISHED');
  assert.deepEqual(e?.data, { result: 'ABANDONED' });
  assert.equal(r.tipos().includes('MATCH_FINISHED'), false);
  assert.equal(j.eventoDeAbandono(), null);
});

test('dos partidas del mismo juego son independientes y tienen matchId distinto', () => {
  const r = new ReceptorFalso();
  const a = nuevo(r);
  const b = nuevo(r);
  a.comenzar(contenedor);
  b.comenzar(contenedor);
  a.morir();
  assert.notEqual(a.matchId, b.matchId);
  assert.equal(a.enCurso, false);
  assert.equal(b.enCurso, true);
});

test('el registro crea una partida nueva cada vez y agrega a la computadora si corresponde', () => {
  const registro = new RegistroJuegos();
  registro.registrar({
    gameId: 'connect4',
    nombre: 'Conecta 4',
    descripcion: '',
    contraComputadora: true,
    crear: (p, rec) => new JuegoDePrueba(p, rec),
  });
  const r = new ReceptorFalso();
  const a = registro.nuevaPartida('connect4', 'Omar Pérez', r);
  const b = registro.nuevaPartida('connect4', 'Omar Pérez', r);
  assert.notEqual(a.matchId, b.matchId);
  assert.throws(() => registro.registrar({ ...registro.obtener('connect4')! }), /ya está registrado/);
  assert.throws(() => registro.nuevaPartida('ajedrez', 'x', r), /desconocido/);
});

test('los ids de jugador son seguros y una persona no puede llamarse "cpu"', () => {
  assert.equal(new Jugador('  Omar Pérez ').id, 'omar-perez');
  assert.equal(new Jugador('CPU').id, 'cpu-humano');
  assert.equal(new Jugador('').id, 'jugador');
  assert.equal(Jugador.computadora().id, 'cpu');
});
