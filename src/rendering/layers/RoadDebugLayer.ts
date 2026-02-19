import * as THREE from 'three';
import type { Grid } from '../../core/Grid';
import type { Car } from '../../entities/Car';
import type { Business } from '../../entities/Business';
import { CarState } from '../../entities/Car';
import { CellType, Direction } from '../../types';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../../constants';
import { stepGridPos } from '../../systems/car/CarRouter';
import { laneOffset, opposite } from '../../utils/direction';
import { getBusinessLayout } from '../../utils/businessLayout';

const OUTLINE_Y = 0.6;
const DEBUG_Y = 2;

export class RoadDebugLayer {
  private group: THREE.Group | null = null;
  private greenMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  private redMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
  private edgesGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE));

  // Parking debug materials
  private cyanMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
  private magentaMat = new THREE.LineBasicMaterial({ color: 0xff00ff });
  private yellowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  private dotGeom = new THREE.SphereGeometry(1.5, 8, 6);

  update(scene: THREE.Scene, grid: Grid, cars: Car[], businesses: Business[]): void {
    this.clearFromScene(scene);

    // Build reserved cell set from car paths
    const reserved = new Set<string>();

    for (const car of cars) {
      if (car.state === CarState.GoingToBusiness) {
        for (let i = 0; i < car.pathIndex; i++) {
          const p = stepGridPos(car.path[i]);
          reserved.add(`${p.gx},${p.gy}`);
        }
      } else if (car.state === CarState.Unloading || car.state === CarState.WaitingToExit ||
                 car.state === CarState.ParkingIn || car.state === CarState.ParkingOut) {
        for (const step of car.outboundPath) {
          const p = stepGridPos(step);
          reserved.add(`${p.gx},${p.gy}`);
        }
      } else if (car.state === CarState.GoingHome) {
        for (let i = car.pathIndex; i < car.path.length; i++) {
          const p = stepGridPos(car.path[i]);
          reserved.add(`${p.gx},${p.gy}`);
        }
      }
    }

    const group = new THREE.Group();
    const half = TILE_SIZE / 2;

    for (let gy = 0; gy < GRID_ROWS; gy++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const cell = grid.getCell(gx, gy);
        if (!cell || (cell.type !== CellType.Road && cell.type !== CellType.Connector)) continue;

        const mat = reserved.has(`${gx},${gy}`) ? this.redMat : this.greenMat;
        const outline = new THREE.LineSegments(this.edgesGeom, mat);
        outline.rotation.x = -Math.PI / 2;
        outline.position.set(gx * TILE_SIZE + half, OUTLINE_Y, gy * TILE_SIZE + half);
        group.add(outline);
      }
    }

    // Parking debug: entry/exit lines and slot dots per business
    for (const biz of businesses) {
      const layout = getBusinessLayout({
        buildingPos: biz.pos,
        parkingLotPos: biz.parkingLotPos,
        orientation: biz.orientation,
        connectorSide: biz.connectorSide,
      });

      const connCX = biz.connectorPos.gx * TILE_SIZE + half;
      const connCZ = biz.connectorPos.gy * TILE_SIZE + half;
      const connToParkDir = biz.getConnectorToParkingDir();

      const entryOff = laneOffset(connToParkDir);
      const exitOff = laneOffset(opposite(connToParkDir));
      const entryX = connCX + entryOff.x;
      const entryZ = connCZ + entryOff.y;
      const exitX = connCX + exitOff.x;
      const exitZ = connCZ + exitOff.y;

      const isVertical = connToParkDir === Direction.Up || connToParkDir === Direction.Down;

      for (const slot of layout.parkingSlots) {
        // Entry curve: entry lane → slot center (cyan) with L-shaped control point
        const entryControl = isVertical
          ? new THREE.Vector3(entryX, DEBUG_Y, slot.centerZ)
          : new THREE.Vector3(slot.centerX, DEBUG_Y, entryZ);
        const entryCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(entryX, DEBUG_Y, entryZ),
          entryControl,
          new THREE.Vector3(slot.centerX, DEBUG_Y, slot.centerZ),
        );
        const entryGeom = new THREE.BufferGeometry().setFromPoints(entryCurve.getPoints(16));
        group.add(new THREE.Line(entryGeom, this.cyanMat));

        // Exit curve: slot center → exit lane (magenta) with L-shaped control point
        const exitControl = isVertical
          ? new THREE.Vector3(exitX, DEBUG_Y, slot.centerZ)
          : new THREE.Vector3(slot.centerX, DEBUG_Y, exitZ);
        const exitCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(slot.centerX, DEBUG_Y, slot.centerZ),
          exitControl,
          new THREE.Vector3(exitX, DEBUG_Y, exitZ),
        );
        const exitGeom = new THREE.BufferGeometry().setFromPoints(exitCurve.getPoints(16));
        group.add(new THREE.Line(exitGeom, this.magentaMat));

        // Dot at slot center (yellow)
        const dot = new THREE.Mesh(this.dotGeom, this.yellowMat);
        dot.position.set(slot.centerX, DEBUG_Y, slot.centerZ);
        group.add(dot);
      }
    }

    this.group = group;
    scene.add(group);
  }

  private clearFromScene(scene: THREE.Scene): void {
    if (this.group) {
      scene.remove(this.group);
      this.group = null;
    }
  }

  dispose(scene: THREE.Scene): void {
    this.clearFromScene(scene);
    this.greenMat.dispose();
    this.redMat.dispose();
    this.edgesGeom.dispose();
    this.cyanMat.dispose();
    this.magentaMat.dispose();
    this.yellowMat.dispose();
    this.dotGeom.dispose();
  }
}
