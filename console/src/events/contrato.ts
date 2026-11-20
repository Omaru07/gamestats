// Copia en TypeScript de games/<juego>.json (la configuración que usa Go para validar).
// contrato.test.ts compara esta copia con los archivos reales: si alguien cambia uno y
// olvida el otro, la prueba falla.
export const VERSION_JUEGO = '1.0';

export interface ContratoJuego {
  readonly playerRequired: readonly string[];
  readonly types: Readonly<Record<string, readonly string[]>>;
}

export const CONTRATO: Readonly<Record<string, ContratoJuego>> = {
  connect4: {
    playerRequired: ['PLAYER_JOINED', 'MOVE', 'AI_DECISION'],
    types: {
      MATCH_STARTED: ['players', 'difficulty'],
      PLAYER_JOINED: [],
      MOVE: ['column', 'row', 'piece', 'moveNumber'],
      AI_DECISION: ['column', 'board', 'score', 'nodesExplored', 'depth', 'thinkMs', 'reason'],
      MATCH_FINISHED: ['result'],
    },
  },
  snake: {
    playerRequired: ['PLAYER_JOINED', 'FOOD_EATEN', 'PLAYER_DIED'],
    types: {
      MATCH_STARTED: ['players', 'gridSize'],
      PLAYER_JOINED: [],
      FOOD_EATEN: ['score', 'length'],
      PLAYER_DIED: ['cause', 'score', 'length'],
      MATCH_FINISHED: ['result'],
    },
  },
  nightdrive: {
    playerRequired: ['PLAYER_JOINED', 'LANE_CHANGED', 'CAR_DODGED', 'CRASHED'],
    types: {
      MATCH_STARTED: ['players', 'lanes', 'lives'],
      PLAYER_JOINED: [],
      LANE_CHANGED: ['from', 'to'],
      CAR_DODGED: ['score', 'speed'],
      CRASHED: ['livesLeft', 'score', 'speed'],
      MATCH_FINISHED: ['result'],
    },
  },
};
