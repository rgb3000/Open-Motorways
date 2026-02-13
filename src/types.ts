export interface GridPos {
  gx: number;
  gy: number;
}

export interface PixelPos {
  x: number;
  y: number;
}

export const GameColor = {
  Red: 0,
  Blue: 1,
  Yellow: 2,
  Green: 3,
  Purple: 4,
  Orange: 5,
} as const;
export type GameColor = (typeof GameColor)[keyof typeof GameColor];

export const CellType = {
  Empty: 0,
  Road: 1,
  House: 2,
  Business: 3,
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

export const Direction = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const LaneId = {
  HorizontalRight: 0,
  HorizontalLeft: 1,
  VerticalDown: 2,
  VerticalUp: 3,
} as const;
export type LaneId = (typeof LaneId)[keyof typeof LaneId];

export const GameState = {
  Playing: 0,
  Paused: 1,
  GameOver: 2,
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export interface Cell {
  type: CellType;
  entityId: string | null;
  roadConnections: Direction[];
  color: GameColor | null;
}
