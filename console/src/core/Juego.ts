// Clase base de los tres juegos (antes era la interfaz GameFunction del proyecto en Java).
//
// Usa el patrón "método plantilla": comenzar() siempre hace lo mismo (emite MATCH_STARTED
// y un PLAYER_JOINED por jugador, y luego monta la vista), y cada juego solo completa las
// partes que cambian: datosDeInicio(), montar() y desmontar().
//
// Ya no hay singleton: cada partida es un objeto Juego nuevo con su propia Partida, así que
// pueden correr varias a la vez sin compartir estado.
import { FabricaEventos } from '../events/FabricaEventos.ts';
import type { DatosEvento, Evento, ReceptorEventos } from '../events/tipos.ts';
import type { Jugador } from './Jugador.ts';
import type { Partida, Resultado } from './Partida.ts';

type OyenteFin = (partida: Partida) => void;

export abstract class Juego {
  protected readonly partida: Partida;
  readonly #receptor: ReceptorEventos;
  readonly #oyentesFin = new Set<OyenteFin>();
  #comenzado = false;
  #montado = false;

  constructor(partida: Partida, receptor: ReceptorEventos) {
    this.partida = partida;
    this.#receptor = receptor;
  }

  get matchId(): string {
    return this.partida.matchId;
  }

  get gameId(): string {
    return this.partida.gameId;
  }

  get enCurso(): boolean {
    return this.partida.enCurso;
  }

  get resultado(): Resultado | null {
    return this.partida.resultado;
  }

  // Método plantilla: igual para todos los juegos.
  comenzar(contenedor: HTMLElement): void {
    if (this.#comenzado) throw new Error(`la partida ${this.matchId} ya comenzó`);
    this.#comenzado = true;
    this.emitir('MATCH_STARTED', {
      players: this.partida.jugadores.map((j) => j.id),
      ...this.datosDeInicio(),
    });
    for (const jugador of this.partida.jugadores) {
      this.emitir('PLAYER_JOINED', {}, jugador.id);
    }
    this.montar(contenedor);
    this.#montado = true;
  }

  // El botón "cerrar" de la consola: si la partida seguía, cuenta como abandonada.
  cerrar(): void {
    if (this.partida.enCurso && this.#comenzado) this.terminar('ABANDONED');
    if (this.#montado) {
      this.desmontar();
      this.#montado = false;
    }
  }

  // Para cuando se cierra la pestaña: arma el MATCH_FINISHED de abandono SIN encolarlo,
  // para que la consola lo mande con sendBeacon. Devuelve null si no hace falta.
  eventoDeAbandono(): Evento | null {
    if (!this.#comenzado || !this.partida.enCurso) return null;
    const evento = FabricaEventos.crear(this.partida, 'MATCH_FINISHED', { result: 'ABANDONED' });
    this.partida.cerrar('ABANDONED');
    return evento;
  }

  alTerminar(oyente: OyenteFin): () => void {
    this.#oyentesFin.add(oyente);
    return () => this.#oyentesFin.delete(oyente);
  }

  // Datos propios del juego que van en MATCH_STARTED (además de "players").
  protected abstract datosDeInicio(): DatosEvento;
  // Dibuja el juego dentro del contenedor y conecta teclado, mouse y timers.
  protected abstract montar(contenedor: HTMLElement): void;
  // Detiene timers y quita listeners. Debe poder llamarse aunque la partida ya terminó.
  protected abstract desmontar(): void;

  // Crea el evento con el contrato exacto y lo entrega al receptor (no espera la red).
  protected emitir(type: string, data: DatosEvento = {}, playerId?: string): void {
    if (!this.partida.enCurso) return; // nada después de MATCH_FINISHED: Go lo rechazaría
    this.#receptor.publicar(FabricaEventos.crear(this.partida, type, data, playerId));
  }

  // Cierra la partida: emite MATCH_FINISHED y avisa a quien esté escuchando (la consola).
  protected terminar(resultado: Resultado, ganador?: Jugador): void {
    if (!this.partida.enCurso) return;
    const data: DatosEvento = { result: resultado };
    if (ganador) data.winner = ganador.id;
    this.emitir('MATCH_FINISHED', data);
    this.partida.cerrar(resultado);
    for (const oyente of this.#oyentesFin) oyente(this.partida);
  }
}
