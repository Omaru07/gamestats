// Arma eventos que GameStats acepta. Revisa ANTES de enviar lo mismo que revisaría Go
// (tipo existente, playerId y campos obligatorios) y además lo que Scala no perdona
// (tipos de valor en data). Un error de contrato es un error de programación del juego,
// así que se lanza una excepción en vez de mandar un evento que sería rechazado.
import type { Partida } from '../core/Partida.ts';
import { nuevoId } from '../core/ids.ts';
import { CONTRATO, VERSION_JUEGO } from './contrato.ts';
import type { DatosEvento, Evento, ValorDato } from './tipos.ts';

export class ErrorContrato extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorContrato';
  }
}

export class FabricaEventos {
  static crear(
    partida: Partida,
    type: string,
    data: DatosEvento = {},
    playerId?: string,
    ahora: Date = new Date(),
  ): Evento {
    const contrato = CONTRATO[partida.gameId];
    if (!contrato) throw new ErrorContrato(`el juego "${partida.gameId}" no tiene contrato`);

    const obligatorios = contrato.types[type];
    if (!obligatorios) throw new ErrorContrato(`el tipo ${type} no existe en ${partida.gameId}`);

    if (contrato.playerRequired.includes(type) && !playerId) {
      throw new ErrorContrato(`el tipo ${type} requiere playerId`);
    }
    for (const campo of obligatorios) {
      if (!(campo in data)) throw new ErrorContrato(`falta data.${campo} para ${type}`);
    }
    for (const [campo, valor] of Object.entries(data)) {
      FabricaEventos.validarValor(campo, valor);
    }

    const evento: Evento = {
      eventId: nuevoId(),
      timestamp: ahora.toISOString(),
      gameId: partida.gameId,
      gameVersion: VERSION_JUEGO,
      matchId: partida.matchId,
      type,
      data: { ...data },
    };
    if (playerId) evento.playerId = playerId;
    return evento;
  }

  private static validarValor(campo: string, valor: ValorDato): void {
    const ok =
      typeof valor === 'string' ||
      (typeof valor === 'number' && Number.isFinite(valor)) ||
      (Array.isArray(valor) && valor.every((x) => typeof x === 'string'));
    if (!ok) {
      throw new ErrorContrato(
        `data.${campo}: solo se permite texto, número o lista de textos (Scala descarta lo demás)`,
      );
    }
  }
}
