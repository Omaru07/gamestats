// Un participante de la partida: la persona o la computadora.
export class Jugador {
  static readonly ID_COMPUTADORA = 'cpu';

  readonly id: string; // el playerId que viaja en los eventos
  readonly nombre: string; // lo que se muestra en pantalla
  readonly esComputadora: boolean;

  constructor(nombre: string, esComputadora = false) {
    this.nombre = nombre.trim() || 'Jugador';
    this.esComputadora = esComputadora;
    this.id = esComputadora ? Jugador.ID_COMPUTADORA : Jugador.normalizar(this.nombre);
  }

  static computadora(): Jugador {
    return new Jugador('Computadora', true);
  }

  // "Omar Pérez" -> "omar-perez". Una persona nunca queda con el id de la computadora.
  static normalizar(nombre: string): string {
    const id = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (id === '') return 'jugador';
    return id === Jugador.ID_COMPUTADORA ? `${id}-humano` : id;
  }
}
