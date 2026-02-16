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
  ParkingLot: 4,
  Connector: 5,
  Mountain: 6,
  Lake: 7,
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

export const Direction = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
  UpLeft: 4,
  UpRight: 5,
  DownLeft: 6,
  DownRight: 7,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const LaneId = {
  HorizontalRight: 0,
  HorizontalLeft: 1,
  VerticalDown: 2,
  VerticalUp: 3,
  DiagDownRight: 4,
  DiagUpLeft: 5,
  DiagDownLeft: 6,
  DiagUpRight: 7,
} as const;
export type LaneId = (typeof LaneId)[keyof typeof LaneId];

export const GameState = {
  WaitingToStart: 3,
  Playing: 0,
  Paused: 1,
  GameOver: 2,
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export const Tool = {
  Road: 0,
  Eraser: 1,
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export interface Cell {
  type: CellType;
  entityId: string | null;
  roadConnections: Direction[];
  color: GameColor | null;
  connectorDir: Direction | null;
}
