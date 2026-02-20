import type { Grid } from '../core/Grid';
import type { Pathfinder } from '../pathfinding/Pathfinder';
import { GasStation, type GasStationOrientation } from '../entities/GasStation';
import { CellType, Direction } from '../types';
import type { GridPos } from '../types';
import { computePathFuelCost } from '../pathfinding/pathCost';
import { opposite, DIRECTION_OFFSETS, ALL_DIRECTIONS } from '../utils/direction';
import type { HighwaySystem } from './HighwaySystem';

export class GasStationSystem {
  private gasStations: GasStation[] = [];
  private grid: Grid;
  isDirty = false;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  getGasStations(): GasStation[] {
    return this.gasStations;
  }

  getGasStationById(id: string): GasStation | undefined {
    return this.gasStations.find(gs => gs.id === id);
  }

  clearDirty(): void {
    this.isDirty = false;
  }

  /** Try to place a gas station. Returns the station if successful, null if invalid. */
  placeGasStation(anchorPos: GridPos, orientation: GasStationOrientation): GasStation | null {
    const station = new GasStation(anchorPos, orientation);
    const cells = station.getCells();

    // Validate all 4 cells are empty and in bounds
    for (const pos of cells) {
      if (!this.grid.inBounds(pos.gx, pos.gy)) return null;
      const cell = this.grid.getCell(pos.gx, pos.gy);
      if (!cell || cell.type !== CellType.Empty) return null;
    }

    // Set grid cells
    // Entry connector
    const entryDir = orientation === 'horizontal' ? Direction.Right : Direction.Down;
    this.grid.setCell(station.entryConnectorPos.gx, station.entryConnectorPos.gy, {
      type: CellType.Connector,
      entityId: station.id,
      roadConnections: entryDir,
      connectorDir: null,
    });

    // Station cells
    this.grid.setCell(station.pos.gx, station.pos.gy, {
      type: CellType.GasStation,
      entityId: station.id,
    });
    this.grid.setCell(station.pos2.gx, station.pos2.gy, {
      type: CellType.GasStation,
      entityId: station.id,
    });

    // Exit connector
    const exitDir = orientation === 'horizontal' ? Direction.Left : Direction.Up;
    this.grid.setCell(station.exitConnectorPos.gx, station.exitConnectorPos.gy, {
      type: CellType.Connector,
      entityId: station.id,
      roadConnections: exitDir,
      connectorDir: null,
    });

    // Auto-connect connectors to adjacent road cells
    this.autoConnectToRoads(station.entryConnectorPos);
    this.autoConnectToRoads(station.exitConnectorPos);

    this.gasStations.push(station);
    this.isDirty = true;
    return station;
  }

  removeGasStation(id: string): boolean {
    const idx = this.gasStations.findIndex(gs => gs.id === id);
    if (idx === -1) return false;

    const station = this.gasStations[idx];
    const cells = station.getCells();

    // Disconnect from adjacent roads before clearing
    this.disconnectFromRoads(station.entryConnectorPos);
    this.disconnectFromRoads(station.exitConnectorPos);

    // Clear all 4 cells
    for (const pos of cells) {
      this.grid.setCell(pos.gx, pos.gy, {
        type: CellType.Empty,
        entityId: null,
        roadConnections: 0,
        connectorDir: null,
        color: null,
      });
    }

    this.gasStations.splice(idx, 1);
    this.isDirty = true;
    return true;
  }

  /** Find the nearest reachable gas station from a position by path distance */
  findNearestReachable(
    fromPos: GridPos,
    pathfinder: Pathfinder,
    highwaySystem?: HighwaySystem | null,
  ): { station: GasStation; fuelCost: number } | null {
    let best: { station: GasStation; fuelCost: number } | null = null;

    for (const station of this.gasStations) {
      const path = pathfinder.findPath(fromPos, station.entryConnectorPos);
      if (!path || path.length < 2) continue;

      const fuelCost = computePathFuelCost(path, highwaySystem);

      if (!best || fuelCost < best.fuelCost) {
        best = { station, fuelCost };
      }
    }

    return best;
  }

  /** Find gas station by connector position */
  findByConnectorPos(pos: GridPos): GasStation | undefined {
    return this.gasStations.find(gs =>
      (gs.entryConnectorPos.gx === pos.gx && gs.entryConnectorPos.gy === pos.gy) ||
      (gs.exitConnectorPos.gx === pos.gx && gs.exitConnectorPos.gy === pos.gy)
    );
  }

  /** Find gas station that owns a given cell position */
  findByCellPos(gx: number, gy: number): GasStation | undefined {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || !cell.entityId) return undefined;
    if (cell.type !== CellType.GasStation && cell.type !== CellType.Connector) return undefined;
    return this.gasStations.find(gs => gs.id === cell.entityId);
  }

  private autoConnectToRoads(connectorPos: GridPos): void {
    const connectorCell = this.grid.getCell(connectorPos.gx, connectorPos.gy);
    if (!connectorCell) return;

    for (const dir of ALL_DIRECTIONS) {
      const off = DIRECTION_OFFSETS[dir];
      const nx = connectorPos.gx + off.gx;
      const ny = connectorPos.gy + off.gy;
      const neighbor = this.grid.getCell(nx, ny);
      if (!neighbor) continue;

      if (neighbor.type === CellType.Road) {
        // Connect connector → road
        connectorCell.roadConnections |= dir;
        // Connect road → connector
        neighbor.roadConnections |= opposite(dir);
      }
    }
  }

  private disconnectFromRoads(connectorPos: GridPos): void {
    const connectorCell = this.grid.getCell(connectorPos.gx, connectorPos.gy);
    if (!connectorCell) return;

    for (const dir of ALL_DIRECTIONS) {
      const off = DIRECTION_OFFSETS[dir];
      const nx = connectorPos.gx + off.gx;
      const ny = connectorPos.gy + off.gy;
      const neighbor = this.grid.getCell(nx, ny);
      if (!neighbor) continue;

      if (neighbor.type === CellType.Road) {
        // Remove road → connector connection
        neighbor.roadConnections &= ~opposite(dir);
      }
    }
  }
}
