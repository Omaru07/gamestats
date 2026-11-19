// Traducción de JuegoConecta4.java a la consola web.
// Cambios respecto a Java:
//  - Sin singleton: cada partida es un objeto nuevo, así que puede haber varias a la vez.
//  - La computadora ya no elige al azar: le pregunta a la IA en Prolog (ProveedorJugadas).
//  - Thread.sleep(500) bloqueaba la ventana; aquí se espera sin congelar la página.
//  - En vez de un Stat al final, emite eventos durante toda la partida para GameStats.
//  - La vista no conoce al juego: solo le avisa qué columna eligió la persona.
import { Juego } from '../../core/Juego.ts';
import type { Partida } from '../../core/Partida.ts';
import type { DatosEvento, ReceptorEventos } from '../../events/tipos.ts';
import { ClienteIAConecta4, type DecisionIA, type ProveedorJugadas } from './ClienteIA.ts';
import { COMPUTADORA, type Ficha, JUGADOR, type Posicion, TableroConecta4 } from './TableroConecta4.ts';
import { VistaConecta4 } from './VistaConecta4.ts';

export interface AccionesConecta4 {
  alElegirColumna(columna: number): void;
}

export type TipoEstado = 'normal' | 'pensando' | 'error';

// Lo que el juego necesita de su vista (la real usa HTML; en las pruebas, una falsa).
export interface VistaTablero {
  actualizar(tablero: TableroConecta4): void;
  mostrarEstado(texto: string, tipo?: TipoEstado): void;
  mostrarDecision(decision: DecisionIA): void;
  mostrarFinal(mensaje: string, linea: Posicion[] | null): void;
  permitirJugar(permitir: boolean): void;
  destruir(): void;
}

export interface OpcionesConecta4 {
  ia?: ProveedorJugadas;
  crearVista?: (contenedor: HTMLElement, acciones: AccionesConecta4) => VistaTablero;
  esperar?: (ms: number) => Promise<void>;
  profundidad?: number;
  pausaMinimaMs?: number; // la jugada de la computadora no aparece "instantánea"
  esperaReintentoMs?: number;
}

type Turno = 'HUMANO' | 'COMPUTADORA';

export class JuegoConecta4 extends Juego {
  static readonly PROFUNDIDAD = 5;

  readonly #tablero = new TableroConecta4();
  readonly #ia: ProveedorJugadas;
  readonly #crearVista: (contenedor: HTMLElement, acciones: AccionesConecta4) => VistaTablero;
  readonly #esperar: (ms: number) => Promise<void>;
  readonly #profundidad: number;
  readonly #pausaMinimaMs: number;
  readonly #esperaReintentoMs: number;
  #vista: VistaTablero | null = null;
  #movimientos = 0;
  #turno: Turno = 'HUMANO';
  #turnoComputadora: Promise<void> | null = null;

  constructor(partida: Partida, receptor: ReceptorEventos, opciones: OpcionesConecta4 = {}) {
    super(partida, receptor);
    if (!partida.computadora) throw new Error('Conecta 4 necesita a la computadora como rival');
    this.#ia = opciones.ia ?? new ClienteIAConecta4();
    this.#crearVista = opciones.crearVista ?? ((c, a) => new VistaConecta4(c, a));
    this.#esperar = opciones.esperar ?? ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    this.#profundidad = opciones.profundidad ?? JuegoConecta4.PROFUNDIDAD;
    this.#pausaMinimaMs = opciones.pausaMinimaMs ?? 500;
    this.#esperaReintentoMs = opciones.esperaReintentoMs ?? 2000;
  }

  get tablero(): TableroConecta4 {
    return this.#tablero;
  }

  get turno(): Turno {
    return this.#turno;
  }

  // Para las pruebas: termina cuando la computadora ya jugó.
  esperarComputadora(): Promise<void> {
    return this.#turnoComputadora ?? Promise.resolve();
  }

  protected datosDeInicio(): DatosEvento {
    return { difficulty: 'hard' };
  }

  protected montar(contenedor: HTMLElement): void {
    this.#vista = this.#crearVista(contenedor, {
      alElegirColumna: (columna) => this.colocarFicha(columna),
    });
    this.#vista.actualizar(this.#tablero);
    this.#vista.mostrarEstado('¡Tu turno! Elige una columna (Rojo: tú, Amarillo: computadora)');
    this.#vista.permitirJugar(true);
  }

  protected desmontar(): void {
    this.#vista?.destruir();
    this.#vista = null;
  }

  // La jugada de la persona (colocarFicha en Java).
  colocarFicha(columna: number): boolean {
    if (!this.enCurso || this.#turno !== 'HUMANO') return false;
    const fila = this.#tablero.colocarFicha(columna, JUGADOR);
    if (fila === -1) {
      this.#vista?.mostrarEstado('¡Esta columna está llena! Elige otra.', 'error');
      return false;
    }
    this.#registrarMovimiento(columna, fila, 'R', this.partida.humano.id);
    if (!this.#verificarFin(fila, columna, JUGADOR)) {
      this.#turnoComputadora = this.#jugarComputadora().finally(() => {
        this.#turnoComputadora = null;
      });
    }
    return true;
  }

  // turnoComputadora en Java. Si Prolog no responde, avisa y reintenta: nunca juega al azar.
  async #jugarComputadora(): Promise<void> {
    this.#turno = 'COMPUTADORA';
    this.#vista?.permitirJugar(false);
    this.#vista?.mostrarEstado('La computadora está pensando…', 'pensando');

    const tableroAntes = this.#tablero.aTexto();
    let decision: DecisionIA | null = null;
    while (decision === null) {
      try {
        decision = await this.#ia.pedirJugada(tableroAntes, 'Y', this.#profundidad);
      } catch (error) {
        if (!this.enCurso) return;
        const segundos = this.#esperaReintentoMs / 1000;
        this.#vista?.mostrarEstado(
          `No hay respuesta de la IA en Prolog (${String(error)}). Reintentando en ${segundos} s…`,
          'error',
        );
        await this.#esperar(this.#esperaReintentoMs);
        if (!this.enCurso) return;
        this.#vista?.mostrarEstado('La computadora está pensando…', 'pensando');
      }
    }
    if (decision.thinkMs < this.#pausaMinimaMs) {
      await this.#esperar(this.#pausaMinimaMs - decision.thinkMs);
    }
    if (!this.enCurso) return; // la persona cerró la partida mientras la IA pensaba
    if (!this.#tablero.columnaValida(decision.column)) {
      this.#vista?.mostrarEstado(`La IA devolvió una columna inválida (${decision.column}).`, 'error');
      return;
    }

    const cpu = this.partida.computadora!.id;
    this.emitir(
      'AI_DECISION',
      {
        column: decision.column,
        board: tableroAntes,
        score: decision.score,
        nodesExplored: decision.nodesExplored,
        depth: decision.depth,
        thinkMs: decision.thinkMs,
        reason: decision.reason,
      },
      cpu,
    );
    const fila = this.#tablero.colocarFicha(decision.column, COMPUTADORA);
    this.#registrarMovimiento(decision.column, fila, 'Y', cpu);
    this.#vista?.mostrarDecision(decision);
    if (this.#verificarFin(fila, decision.column, COMPUTADORA)) return;

    this.#turno = 'HUMANO';
    this.#vista?.permitirJugar(true);
    this.#vista?.mostrarEstado('¡Tu turno!');
  }

  #registrarMovimiento(columna: number, fila: number, pieza: 'R' | 'Y', playerId: string): void {
    this.#movimientos++;
    this.emitir('MOVE', { column: columna, row: fila, piece: pieza, moveNumber: this.#movimientos }, playerId);
    this.#vista?.actualizar(this.#tablero);
  }

  // Devuelve true si la partida terminó (alguien ganó o el tablero se llenó).
  #verificarFin(fila: number, columna: number, ficha: Ficha): boolean {
    const linea = this.#tablero.lineaGanadora(fila, columna, ficha);
    if (linea) {
      const ganoPersona = ficha === JUGADOR;
      this.terminar(ganoPersona ? 'WIN' : 'LOSS', ganoPersona ? this.partida.humano : this.partida.computadora);
      this.#vista?.permitirJugar(false);
      this.#vista?.mostrarFinal(
        ganoPersona ? '¡Felicidades! ¡Ganaste!' : 'La computadora ganó. ¡Inténtalo de nuevo!',
        linea,
      );
      return true;
    }
    if (this.#tablero.tableroLleno()) {
      this.terminar('DRAW');
      this.#vista?.permitirJugar(false);
      this.#vista?.mostrarFinal('¡Empate! El tablero está lleno.', null);
      return true;
    }
    return false;
  }
}
