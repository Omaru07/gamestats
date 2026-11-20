import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jugador } from '../../core/Jugador.ts';
import { Partida } from '../../core/Partida.ts';
import type { Evento, ReceptorEventos } from '../../events/tipos.ts';
import type { DecisionIA, ProveedorJugadas } from './ClienteIA.ts';
import { JuegoConecta4, type VistaTablero } from './JuegoConecta4.ts';

class ReceptorFalso implements ReceptorEventos {
  readonly eventos: Evento[] = [];
  publicar(e: Evento): void {
    this.eventos.push(e);
  }
  tipos(): string[] {
    return this.eventos.map((e) => e.type);
  }
}

// IA falsa: juega las columnas de la lista, en orden. "error" simula a Prolog caído.
class IAFalsa implements ProveedorJugadas {
  readonly tablerosRecibidos: string[] = [];
  readonly #jugadas: Array<number | 'error'>;
  constructor(jugadas: Array<number | 'error'>) {
    this.#jugadas = [...jugadas];
  }
  async pedirJugada(tablero: string, ficha: 'R' | 'Y', profundidad: number): Promise<DecisionIA> {
    assert.equal(ficha, 'Y');
    assert.equal(profundidad, 5);
    this.tablerosRecibidos.push(tablero);
    const j = this.#jugadas.shift();
    if (j === undefined || j === 'error') throw new Error('ECONNREFUSED');
    return { column: j, score: 7, nodesExplored: 1234, depth: 5, reason: 'minimax', thinkMs: 40 };
  }
}

class VistaFalsa implements VistaTablero {
  estados: string[] = [];
  final: string | null = null;
  permitido = false;
  destruida = false;
  actualizar(): void {}
  mostrarEstado(texto: string): void {
    this.estados.push(texto);
  }
  mostrarDecision(): void {}
  mostrarFinal(mensaje: string): void {
    this.final = mensaje;
  }
  permitirJugar(p: boolean): void {
    this.permitido = p;
  }
  destruir(): void {
    this.destruida = true;
  }
}

function preparar(jugadas: Array<number | 'error'>) {
  const receptor = new ReceptorFalso();
  const ia = new IAFalsa(jugadas);
  const vista = new VistaFalsa();
  const esperas: number[] = [];
  const juego = new JuegoConecta4(
    new Partida('connect4', [new Jugador('Omar'), Jugador.computadora()]),
    receptor,
    {
      ia,
      crearVista: () => vista,
      esperar: async (ms) => {
        esperas.push(ms);
      },
    },
  );
  juego.comenzar({} as HTMLElement);
  return { juego, receptor, ia, vista, esperas };
}

async function jugar(juego: JuegoConecta4, columna: number): Promise<void> {
  assert.equal(juego.colocarFicha(columna), true, `no se pudo jugar en la columna ${columna}`);
  await juego.esperarComputadora();
}

test('la persona gana en horizontal: eventos completos y resultado WIN', async () => {
  const { juego, receptor, vista } = preparar([6, 6, 6]);
  for (const c of [0, 1, 2]) await jugar(juego, c);
  assert.equal(juego.colocarFicha(3), true);

  assert.deepEqual(receptor.tipos(), [
    'MATCH_STARTED', 'PLAYER_JOINED', 'PLAYER_JOINED',
    'MOVE', 'AI_DECISION', 'MOVE',
    'MOVE', 'AI_DECISION', 'MOVE',
    'MOVE', 'AI_DECISION', 'MOVE',
    'MOVE', 'MATCH_FINISHED',
  ]);
  assert.deepEqual(receptor.eventos[0].data, { players: ['omar', 'cpu'], difficulty: 'hard' });
  assert.deepEqual(receptor.eventos.at(-1)?.data, { result: 'WIN', winner: 'omar' });
  assert.equal(juego.enCurso, false);
  assert.equal(vista.final, '¡Felicidades! ¡Ganaste!');
  assert.equal(vista.permitido, false);
});

test('los eventos de la computadora: AI_DECISION con el tablero que vio Prolog y luego su MOVE', async () => {
  const { juego, receptor, ia } = preparar([3]);
  await jugar(juego, 0);
  const decision = receptor.eventos.find((e) => e.type === 'AI_DECISION')!;
  assert.equal(decision.playerId, 'cpu');
  assert.deepEqual(decision.data, {
    column: 3, board: ia.tablerosRecibidos[0], score: 7, nodesExplored: 1234,
    depth: 5, thinkMs: 40, reason: 'minimax',
  });
  assert.match(String(decision.data.board), /^\.{35}R\.{6}$/);
  const movimientos = receptor.eventos.filter((e) => e.type === 'MOVE');
  assert.deepEqual(movimientos.map((e) => [e.playerId, e.data]), [
    ['omar', { column: 0, row: 5, piece: 'R', moveNumber: 1 }],
    ['cpu', { column: 3, row: 5, piece: 'Y', moveNumber: 2 }],
  ]);
});

test('la computadora gana: resultado LOSS con winner cpu', async () => {
  const { juego, receptor, vista } = preparar([6, 6, 6, 6]);
  for (const c of [0, 0, 1]) await jugar(juego, c);
  await jugar(juego, 2);
  assert.deepEqual(receptor.eventos.at(-1)?.data, { result: 'LOSS', winner: 'cpu' });
  assert.equal(vista.final, 'La computadora ganó. ¡Inténtalo de nuevo!');
});

test('no se puede jugar mientras la computadora piensa', async () => {
  const { juego } = preparar([3]);
  assert.equal(juego.colocarFicha(0), true);
  assert.equal(juego.turno, 'COMPUTADORA');
  assert.equal(juego.colocarFicha(1), false);
  await juego.esperarComputadora();
  assert.equal(juego.turno, 'HUMANO');
});

test('columna llena: no se juega y se avisa', async () => {
  const { juego, vista } = preparar([0, 0, 0]);
  for (let i = 0; i < 3; i++) await jugar(juego, 0);
  assert.equal(juego.colocarFicha(0), false);
  assert.equal(vista.estados.at(-1), '¡Esta columna está llena! Elige otra.');
});

test('si Prolog no responde, reintenta (nunca juega al azar) y sigue cuando vuelve', async () => {
  const { juego, receptor, vista, esperas } = preparar(['error', 'error', 4]);
  await jugar(juego, 0);
  assert.ok(esperas.includes(2000));
  assert.ok(vista.estados.some((e) => e.startsWith('No hay respuesta de la IA en Prolog')));
  const decision = receptor.eventos.find((e) => e.type === 'AI_DECISION')!;
  assert.equal(decision.data.column, 4);
  assert.equal(juego.turno, 'HUMANO');
});

test('cerrar mientras la IA está caída abandona la partida y no emite nada más', async () => {
  const { juego, receptor, vista } = preparar(['error']);
  juego.colocarFicha(0);
  juego.cerrar();
  await juego.esperarComputadora();
  assert.deepEqual(receptor.eventos.at(-1)?.data, { result: 'ABANDONED' });
  assert.equal(receptor.tipos().includes('AI_DECISION'), false);
  assert.equal(vista.destruida, true);
});

test('dos partidas de Conecta 4 a la vez no comparten tablero', async () => {
  const a = preparar([6]);
  const b = preparar([6]);
  await jugar(a.juego, 0);
  assert.equal(b.juego.tablero.aTexto(), '.'.repeat(42));
  assert.notEqual(a.juego.matchId, b.juego.matchId);
});
