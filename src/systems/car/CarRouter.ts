import type { Car } from '../../entities/Car';
import { CarState } from '../../entities/Car';
import type { Pathfinder } from '../../pathfinding/Pathfinder';
import type { Grid } from '../../core/Grid';
import type { House } from '../../entities/House';
import { CellType } from '../../types';
import type { GridPos } from '../../types';
import { gridToPixelCenter, pixelToGrid } from '../../utils/math';
import { computeSmoothLanePath } from '../../utils/roadGeometry';

export class CarRouter {
  private pathfinder: Pathfinder;
  private grid: Grid;

  constructor(pathfinder: Pathfinder, grid: Grid) {
    this.pathfinder = pathfinder;
    this.grid = grid;
  }

  getCarCurrentTile(car: Car): GridPos {
    if (car.path.length >= 2 && car.pathIndex < car.path.length - 1) {
      return car.segmentProgress >= 0.5
        ? car.path[car.pathIndex + 1]
        : car.path[car.pathIndex];
    }
    if (car.path.length > 0 && car.pathIndex < car.path.length) {
      return car.path[car.pathIndex];
    }
    return pixelToGrid(car.pixelPos.x, car.pixelPos.y);
  }

  assignPath(car: Car, path: GridPos[]): void {
    car.path = path;
    car.pathIndex = 0;
    car.segmentProgress = 0;
    if (path.length >= 2) {
      let startTrim = 0;
      let endTrim = path.length;
      while (startTrim < path.length) {
        const cell = this.grid.getCell(path[startTrim].gx, path[startTrim].gy);
        if (cell && cell.type !== CellType.Business) break;
        startTrim++;
      }
      while (endTrim > startTrim) {
        const cell = this.grid.getCell(path[endTrim - 1].gx, path[endTrim - 1].gy);
        if (cell && cell.type !== CellType.Business) break;
        endTrim--;
      }
      const smoothPath = path.slice(startTrim, endTrim);
      if (smoothPath.length >= 2) {
        const smooth = computeSmoothLanePath(smoothPath);
        car.smoothPath = smooth.points;
        car.smoothCumDist = smooth.cumDist;
        const padded = new Array(startTrim).fill(0);
        car.smoothCellDist = padded.concat(smooth.cellDist);
      } else {
        car.smoothPath = [];
        car.smoothCumDist = [];
        car.smoothCellDist = [];
      }
    } else {
      car.smoothPath = [];
      car.smoothCumDist = [];
      car.smoothCellDist = [];
    }
  }

  rerouteCar(car: Car, houses: House[]): void {
    if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit) return;

    const currentTile = this.getCarCurrentTile(car);
    const home = houses.find(h => h.id === car.homeHouseId);

    // 1. Try to repath to original destination
    if (car.destination) {
      const path = this.pathfinder.findPath(currentTile, car.destination);
      if (path) {
        this.assignPath(car, path);
        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
        } else {
          const center = gridToPixelCenter(currentTile);
          car.pixelPos.x = center.x;
          car.pixelPos.y = center.y;
        }
        return;
      }
    }

    // 2. If GoingToBusiness and can't reach business, clear target and try home
    if (car.state === CarState.GoingToBusiness) {
      car.targetBusinessId = null;
    }

    // 3. Try path home
    if (home) {
      const homePath = this.pathfinder.findPath(currentTile, home.pos);
      if (homePath) {
        car.state = CarState.GoingHome;
        car.destination = home.pos;
        this.assignPath(car, homePath);
        if (car.smoothPath.length >= 2) {
          car.pixelPos.x = car.smoothPath[0].x;
          car.pixelPos.y = car.smoothPath[0].y;
        } else {
          const center = gridToPixelCenter(currentTile);
          car.pixelPos.x = center.x;
          car.pixelPos.y = center.y;
        }
        return;
      }
    }

    // 4. Nothing works — strand the car
    car.state = CarState.Stranded;
    car.path = [];
    car.pathIndex = 0;
    car.segmentProgress = 0;
    car.smoothPath = [];
    car.smoothCumDist = [];
    car.smoothCellDist = [];
    const center = gridToPixelCenter(currentTile);
    car.pixelPos.x = center.x;
    car.pixelPos.y = center.y;
    if (home) {
      car.destination = home.pos;
    }
  }
}
