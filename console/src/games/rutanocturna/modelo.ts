// Ruta Nocturna: las piezas del juego (sin dibujo ni eventos).
// Vista horizontal: la carretera corre de izquierda a derecha y los 4 carriles van uno
// encima del otro (carril 0 = arriba). El auto del jugador va fijo cerca de la izquierda
// mirando a la derecha; el tráfico entra por la derecha y viene de frente.
// Las distancias se miden en "unidades de pantalla" (x = 0 es la orilla izquierda).

export class Carretera {
  static readonly CARRILES = 4;
  static readonly LARGO = 560;
  static readonly LARGO_AUTO = 64;
  static readonly X_JUGADOR = 70;

  static carrilValido(carril: number): boolean {
    return Number.isInteger(carril) && carril >= 0 && carril < Carretera.CARRILES;
  }
}

export class AutoJugador {
  #carril: number;

  constructor(carril = 1) {
    this.#carril = carril;
  }

  get carril(): number {
    return this.#carril;
  }

  get x(): number {
    return Carretera.X_JUGADOR;
  }

  // Sube (-1) o baja (+1) un carril sin salirse de la carretera.
  // Devuelve el cambio hecho, o null si ya estaba en la orilla.
  cambiarCarril(delta: -1 | 1): { desde: number; hasta: number } | null {
    const hasta = this.#carril + delta;
    if (!Carretera.carrilValido(hasta)) return null;
    const desde = this.#carril;
    this.#carril = hasta;
    return { desde, hasta };
  }
}

export class AutoTrafico {
  readonly carril: number;
  readonly color: number; // índice de color, lo usa la vista
  #x: number;

  constructor(carril: number, color: number, x = Carretera.LARGO) {
    this.carril = carril;
    this.color = color;
    this.#x = x;
  }

  get x(): number {
    return this.#x;
  }

  // Viene de frente: avanza hacia la izquierda.
  avanzar(distancia: number): void {
    this.#x -= distancia;
  }

  // Ya salió por la izquierda de la pantalla: el jugador lo esquivó.
  get paso(): boolean {
    return this.#x + Carretera.LARGO_AUTO < 0;
  }

  chocaCon(jugador: AutoJugador): boolean {
    return (
      this.carril === jugador.carril &&
      this.#x < jugador.x + Carretera.LARGO_AUTO &&
      this.#x + Carretera.LARGO_AUTO > jugador.x
    );
  }
}
