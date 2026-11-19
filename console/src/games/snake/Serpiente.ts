// Traducción de Serpiente.java (proyecto anterior de Omar). Casi idéntica:
// LinkedList<Point> pasa a ser un arreglo de puntos con la cabeza en la posición 0.

export interface Punto {
  readonly x: number;
  readonly y: number;
}

export const ARRIBA = 'ARRIBA';
export const ABAJO = 'ABAJO';
export const IZQUIERDA = 'IZQUIERDA';
export const DERECHA = 'DERECHA';
export type Direccion = typeof ARRIBA | typeof ABAJO | typeof IZQUIERDA | typeof DERECHA;

const OPUESTA: Record<Direccion, Direccion> = {
  [ARRIBA]: ABAJO,
  [ABAJO]: ARRIBA,
  [IZQUIERDA]: DERECHA,
  [DERECHA]: IZQUIERDA,
};

export const mismoPunto = (a: Punto, b: Punto): boolean => a.x === b.x && a.y === b.y;

export class Serpiente {
  #cuerpo: Punto[];
  #direccion: Direccion = DERECHA;

  constructor(centroX: number, centroY: number) {
    this.#cuerpo = [
      { x: centroX, y: centroY }, // cabeza
      { x: centroX - 1, y: centroY }, // cuerpo
      { x: centroX - 2, y: centroY }, // cola
    ];
  }

  // Dónde quedará la cabeza en el próximo movimiento (sirve para saber si va a comer).
  siguienteCabeza(): Punto {
    const { x, y } = this.#cuerpo[0];
    switch (this.#direccion) {
      case ARRIBA:
        return { x, y: y - 1 };
      case ABAJO:
        return { x, y: y + 1 };
      case IZQUIERDA:
        return { x: x - 1, y };
      case DERECHA:
        return { x: x + 1, y };
    }
  }

  mover(crecer: boolean): void {
    this.#cuerpo.unshift(this.siguienteCabeza()); // agregar nueva cabeza
    if (!crecer) this.#cuerpo.pop();
  }

  // Evita que se devuelva sobre sí misma.
  cambiarDireccion(nueva: Direccion): void {
    if (OPUESTA[this.#direccion] === nueva) return;
    this.#direccion = nueva;
  }

  // ¿La cabeza está en alguna posición del cuerpo (excepto ella misma)?
  chocoConsigo(): boolean {
    const cabeza = this.#cuerpo[0];
    return this.#cuerpo.slice(1).some((p) => mismoPunto(p, cabeza));
  }

  cabezaEn(posicion: Punto): boolean {
    return mismoPunto(this.#cuerpo[0], posicion);
  }

  ocupa(posicion: Punto): boolean {
    return this.#cuerpo.some((p) => mismoPunto(p, posicion));
  }

  get cabeza(): Punto {
    return this.#cuerpo[0];
  }

  get cuerpo(): readonly Punto[] {
    return this.#cuerpo;
  }

  get longitud(): number {
    return this.#cuerpo.length;
  }

  get direccion(): Direccion {
    return this.#direccion;
  }
}
