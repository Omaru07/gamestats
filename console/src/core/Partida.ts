// Una instancia de un juego. Su matchId es único, así que sus eventos nunca se mezclan
// con los de otras partidas que corren al mismo tiempo (en esta pestaña o en otras).
import { nuevoId } from './ids.ts';
import type { Jugador } from './Jugador.ts';

export type Resultado = 'WIN' | 'LOSS' | 'DRAW' | 'ABANDONED';
export type EstadoPartida = 'EN_CURSO' | 'TERMINADA' | 'ABANDONADA';

export class Partida {
  readonly matchId: string;
  readonly gameId: string;
  readonly jugadores: readonly Jugador[];
  readonly iniciadaEn = new Date();
  #estado: EstadoPartida = 'EN_CURSO';
  #resultado: Resultado | null = null;

  constructor(gameId: string, jugadores: readonly Jugador[], matchId: string = nuevoId()) {
    if (jugadores.length === 0) throw new Error('una partida necesita al menos un jugador');
    this.gameId = gameId;
    this.jugadores = jugadores;
    this.matchId = matchId;
  }

  get estado(): EstadoPartida {
    return this.#estado;
  }

  get resultado(): Resultado | null {
    return this.#resultado;
  }

  get enCurso(): boolean {
    return this.#estado === 'EN_CURSO';
  }

  // La persona que juega (el primer jugador que no es la computadora).
  get humano(): Jugador {
    return this.jugadores.find((j) => !j.esComputadora) ?? this.jugadores[0];
  }

  get computadora(): Jugador | undefined {
    return this.jugadores.find((j) => j.esComputadora);
  }

  // El resultado siempre se expresa desde el punto de vista de la persona.
  cerrar(resultado: Resultado): void {
    if (!this.enCurso) throw new Error(`la partida ${this.matchId} ya terminó`);
    this.#resultado = resultado;
    this.#estado = resultado === 'ABANDONED' ? 'ABANDONADA' : 'TERMINADA';
  }
}
