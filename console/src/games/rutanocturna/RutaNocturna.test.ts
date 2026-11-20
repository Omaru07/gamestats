import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jugador } from '../../core/Jugador.ts';
import { Partida } from '../../core/Partida.ts';
import type { Evento, ReceptorEventos } from '../../events/tipos.ts';
import { JuegoRutaNocturna, type VistaJuegoRuta } from './JuegoRutaNocturna.ts';
import { AutoJugador, AutoTrafico, Carretera } from './modelo.ts';

class ReceptorFalso implements ReceptorEventos {
  readonly eventos: Evento[] = [];
  publicar(e: Evento): void {
    this.eventos.push(e);
  }
  de(tipo: string): Evento[] {
    return this.eventos.filter((e) => e.type === tipo);
  }
}

class VistaFalsa implements VistaJuegoRuta {
  final: number | null = null;
  dibujar(): void {}
  mostrarFinal(puntaje: number): void {
    this.final = puntaje;
  }
  destruir(): void {}
}

// azar fijo: 0.1 -> el tráfico al azar sale en los carriles 0 o 1; 0.9 -> en los carriles 2 o 3.
function preparar(azar = 0.1) {
  const receptor = new ReceptorFalso();
  const vista = new VistaFalsa();
  const juego = new JuegoRutaNocturna(new Partida('nightdrive', [new Jugador('Omar')]), receptor, {
    aleatorio: () => azar,
    crearVista: () => vista,
    usarReloj: false,
  });
  juego.comenzar({} as HTMLElement);
  return { juego, receptor, vista };
}

const correr = (juego: JuegoRutaNocturna, ms: number) => {
  for (let t = 0; t < ms; t += 100) juego.avanzar(100);
};

// ---------- modelo ----------

test('el auto del jugador no se sale de la carretera', () => {
  const a = new AutoJugador(0);
  assert.equal(a.cambiarCarril(-1), null);
  assert.deepEqual(a.cambiarCarril(1), { desde: 0, hasta: 1 });
  const b = new AutoJugador(3);
  assert.equal(b.cambiarCarril(1), null);
});

test('el tráfico entra por la derecha y avanza hacia la izquierda', () => {
  const auto = new AutoTrafico(0, 0);
  assert.equal(auto.x, Carretera.LARGO);
  auto.avanzar(100);
  assert.equal(auto.x, Carretera.LARGO - 100);
  assert.equal(auto.paso, false);
  auto.avanzar(Carretera.LARGO);
  assert.equal(auto.paso, true);
});

test('un auto choca solo si va en el mismo carril y se enciman', () => {
  const jugador = new AutoJugador(1);
  assert.equal(new AutoTrafico(1, 0, Carretera.X_JUGADOR + 30).chocaCon(jugador), true);
  assert.equal(new AutoTrafico(2, 0, Carretera.X_JUGADOR).chocaCon(jugador), false);
  assert.equal(new AutoTrafico(1, 0, Carretera.X_JUGADOR + Carretera.LARGO_AUTO).chocaCon(jugador), false);
});

// ---------- juego ----------

test('MATCH_STARTED lleva carriles y vidas; nada se mueve hasta la primera tecla', () => {
  const { juego, receptor } = preparar();
  assert.deepEqual(receptor.eventos[0].data, { players: ['omar'], lanes: 4, lives: 3 });
  correr(juego, 2000);
  assert.equal(juego.trafico.length, 0);
  assert.equal(juego.distanciaKm, 0);
});

test('cambiar de carril emite LANE_CHANGED; en la orilla no emite nada', () => {
  const { juego, receptor } = preparar();
  juego.cambiarCarril(1);
  juego.cambiarCarril(1);
  juego.cambiarCarril(1); // ya está en el carril 3: no cambia
  assert.deepEqual(
    receptor.de('LANE_CHANGED').map((e) => e.data),
    [{ from: 1, to: 2 }, { from: 2, to: 3 }],
  );
});

test('un auto que pasa sin chocar emite CAR_DODGED con puntaje y velocidad', () => {
  const { juego, receptor } = preparar(0.1);
  juego.cambiarCarril(1);
  juego.cambiarCarril(1); // carril 3; el tráfico al azar va por 0 y 1
  juego.agregarAutoEn(0);
  correr(juego, 1500);
  const esquivados = receptor.de('CAR_DODGED');
  assert.ok(esquivados.length >= 1);
  assert.deepEqual(esquivados[0].data, { score: 10, speed: 120 });
  assert.equal(juego.vidas, 3);
});

test('con turbo se va 40 % más rápido y cada auto esquivado vale el doble', () => {
  const { juego, receptor } = preparar(0.1);
  juego.cambiarCarril(1);
  juego.cambiarCarril(1);
  juego.usarTurbo(true);
  assert.equal(juego.velocidad, 168);
  juego.agregarAutoEn(0);
  correr(juego, 1000);
  assert.deepEqual(receptor.de('CAR_DODGED')[0].data, { score: 20, speed: 168 });
  juego.usarTurbo(false);
  assert.equal(juego.velocidad, 120);
});

test('chocar quita una vida, emite CRASHED y da un momento de invulnerabilidad', () => {
  const { juego, receptor } = preparar(0.9); // el tráfico al azar no va por el carril 1
  juego.cambiarCarril(-1);
  juego.cambiarCarril(1); // vuelve al carril 1 (y arranca)
  juego.agregarAutoEn(1, Carretera.X_JUGADOR);
  juego.avanzar(10);
  assert.equal(juego.vidas, 2);
  assert.deepEqual(receptor.de('CRASHED')[0].data, { livesLeft: 2, score: 0, speed: 120 });
  assert.equal(juego.invulnerable, true);
  juego.agregarAutoEn(1, Carretera.X_JUGADOR); // otro encima, pero aún es invulnerable
  juego.avanzar(10);
  assert.equal(juego.vidas, 2);
});

test('al perder las 3 vidas la partida termina con LOSS', () => {
  const { juego, receptor, vista } = preparar(0.9);
  juego.cambiarCarril(-1);
  juego.cambiarCarril(1);
  for (let i = 0; i < 3; i++) {
    correr(juego, 1600); // que pase la invulnerabilidad
    juego.agregarAutoEn(1, Carretera.X_JUGADOR);
    juego.avanzar(10);
  }
  assert.equal(juego.vidas, 0);
  assert.equal(juego.enCurso, false);
  assert.deepEqual(receptor.de('CRASHED').map((e) => e.data.livesLeft), [2, 1, 0]);
  assert.deepEqual(receptor.eventos.at(-1)?.data, { result: 'LOSS' });
  assert.equal(vista.final, juego.puntaje);
  const total = receptor.eventos.length;
  correr(juego, 1000);
  juego.cambiarCarril(1);
  juego.usarTurbo(true);
  assert.equal(receptor.eventos.length, total); // ya no emite nada
});

test('la velocidad sube con el tiempo hasta el máximo', () => {
  const { juego } = preparar(0.1);
  juego.cambiarCarril(1);
  juego.cambiarCarril(1);
  correr(juego, 2100);
  assert.equal(juego.velocidad, 126);
  correr(juego, 200_000);
  assert.equal(juego.velocidad, JuegoRutaNocturna.VELOCIDAD_MAXIMA);
});

test('si la pestaña estuvo oculta, no da un salto enorme', () => {
  const { juego } = preparar(0.1);
  juego.cambiarCarril(1);
  juego.avanzar(60_000);
  assert.ok(juego.recorrido <= 120 * 4 * 0.1 + 0.001);
});
