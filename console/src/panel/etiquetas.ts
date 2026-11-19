// Cómo se muestran las estadísticas que calcula GameStats: nombres en español y formato.
// Aquí NO se calcula nada: solo se traduce el nombre y se da formato al valor que llegó.
import type { Estadisticas, ValorEstadistica } from './ClienteGameStats.ts';

export const NOMBRES_JUEGO: Record<string, string> = {
  connect4: 'Conecta 4',
  snake: 'Culebrita',
  nightdrive: 'Ruta Nocturna',
  racing: 'Carreras (simulador)',
  combat: 'Combate (simulador)',
};

export const ETIQUETAS_GENERALES: Record<string, string> = {
  totalMatches: 'Partidas analizadas',
  gamesPlayed: 'Juegos con partidas',
  distinctPlayers: 'Jugadores distintos',
  avgDurationSeconds: 'Duración promedio (s)',
  mostPlayedGame: 'Juego más jugado',
  patternsDetected: 'Patrones detectados',
  abandonedMatches: 'Partidas abandonadas',
};

const COMUNES: Record<string, string> = {
  matches: 'Partidas analizadas',
  avgDurationSeconds: 'Duración promedio (s)',
  distinctPlayers: 'Jugadores distintos',
  patternsDetected: 'Patrones detectados',
  abandoned: 'Abandonadas',
};

export const ETIQUETAS_POR_JUEGO: Record<string, Record<string, string>> = {
  connect4: {
    ...COMUNES,
    humanWins: 'Victorias de personas',
    aiWins: 'Victorias de la IA',
    draws: 'Empates',
    avgMovesPerMatch: 'Jugadas por partida',
    aiAvgThinkMs: 'La IA piensa en promedio (ms)',
    aiAvgNodesExplored: 'Tableros que revisa la IA',
    aiBlocks: 'Bloqueos de la IA',
    favoriteOpeningColumn: 'Columna de apertura favorita',
  },
  snake: {
    ...COMUNES,
    bestScore: 'Mejor puntaje',
    avgScore: 'Puntaje promedio',
    avgFoodPerMatch: 'Comida por partida',
    bestLength: 'Mayor longitud',
    wallDeaths: 'Choques con la pared',
    selfDeaths: 'Se mordió la cola',
  },
  nightdrive: {
    ...COMUNES,
    bestScore: 'Mejor puntaje',
    avgScore: 'Puntaje promedio',
    avgCarsDodged: 'Autos esquivados por partida',
    maxSpeed: 'Velocidad máxima (km/h)',
    totalCrashes: 'Choques totales',
  },
};

export interface Fila {
  clave: string;
  etiqueta: string;
  valor: string;
}

export function formatear(clave: string, valor: ValorEstadistica): string {
  if (typeof valor === 'number') return valor.toLocaleString('es', { maximumFractionDigits: 2 });
  if (clave === 'mostPlayedGame') return NOMBRES_JUEGO[valor] ?? valor;
  return valor;
}

// Las filas en el orden de las etiquetas conocidas; lo que GameStats agregue y aquí no
// tenga nombre se muestra igual, al final, con su nombre original.
export function filas(estadisticas: Estadisticas, etiquetas: Record<string, string>): Fila[] {
  const conocidas = Object.keys(etiquetas).filter((k) => k in estadisticas);
  const otras = Object.keys(estadisticas).filter((k) => !(k in etiquetas) && k !== 'gameId');
  return [...conocidas, ...otras].map((clave) => ({
    clave,
    etiqueta: etiquetas[clave] ?? clave,
    valor: formatear(clave, estadisticas[clave]),
  }));
}
