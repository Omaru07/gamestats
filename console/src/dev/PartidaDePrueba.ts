// Partida simulada de Snake para la página de prueba de conexión (Paso 3).
// Solo sirve para comprobar que la consola llega a GameStats antes de tener los juegos
// de verdad. Se borra cuando entre la consola real (Paso 5).
import { Juego } from '../core/Juego.ts';
import type { DatosEvento } from '../events/tipos.ts';

export class PartidaDePrueba extends Juego {
  #timer: ReturnType<typeof setInterval> | null = null;
  #puntaje = 0;
  #longitud = 3;
  #salida: HTMLElement | null = null;

  protected datosDeInicio(): DatosEvento {
    return { gridSize: 20 };
  }

  protected montar(contenedor: HTMLElement): void {
    this.#salida = document.createElement('div');
    this.#salida.className = 'partida-prueba';
    contenedor.append(this.#salida);
    this.#pintar('comenzó');
    let pasos = 0;
    this.#timer = setInterval(() => {
      pasos++;
      if (pasos <= 3) {
        this.#puntaje += 10;
        this.#longitud += 1;
        this.emitir('FOOD_EATEN', { score: this.#puntaje, length: this.#longitud }, this.partida.humano.id);
        this.#pintar(`comió (${this.#puntaje} puntos)`);
      } else {
        this.emitir(
          'PLAYER_DIED',
          { cause: 'wall', score: this.#puntaje, length: this.#longitud },
          this.partida.humano.id,
        );
        this.#detener();
        this.terminar('LOSS');
        this.#pintar('terminó (chocó con la pared)');
      }
    }, 400);
  }

  protected desmontar(): void {
    this.#detener();
    this.#salida?.remove();
  }

  #detener(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #pintar(texto: string): void {
    if (this.#salida) this.#salida.textContent = `${this.matchId.slice(0, 8)}… ${texto}`;
  }
}
