// Catálogo de juegos de la consola: gameId -> cómo crear una partida nueva (patrón fábrica).
// Agregar un juego a la consola = registrar su DefinicionJuego; nada más cambia.
import { CONTRATO } from '../events/contrato.ts';
import type { ReceptorEventos } from '../events/tipos.ts';
import type { Juego } from './Juego.ts';
import { Jugador } from './Jugador.ts';
import { Partida } from './Partida.ts';

export interface DefinicionJuego {
  readonly gameId: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly contraComputadora: boolean;
  crear(partida: Partida, receptor: ReceptorEventos): Juego;
}

export class RegistroJuegos {
  readonly #definiciones = new Map<string, DefinicionJuego>();

  registrar(definicion: DefinicionJuego): void {
    if (this.#definiciones.has(definicion.gameId)) {
      throw new Error(`el juego ${definicion.gameId} ya está registrado`);
    }
    if (!CONTRATO[definicion.gameId]) {
      throw new Error(`el juego ${definicion.gameId} no tiene contrato de eventos`);
    }
    this.#definiciones.set(definicion.gameId, definicion);
  }

  obtener(gameId: string): DefinicionJuego | undefined {
    return this.#definiciones.get(gameId);
  }

  todos(): DefinicionJuego[] {
    return [...this.#definiciones.values()];
  }

  // Cada llamada crea una partida NUEVA con su propio matchId.
  nuevaPartida(gameId: string, nombreJugador: string, receptor: ReceptorEventos): Juego {
    const definicion = this.obtener(gameId);
    if (!definicion) throw new Error(`juego desconocido: ${gameId}`);
    const jugadores = [new Jugador(nombreJugador)];
    if (definicion.contraComputadora) jugadores.push(Jugador.computadora());
    return definicion.crear(new Partida(gameId, jugadores), receptor);
  }
}
