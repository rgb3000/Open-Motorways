import * as THREE from 'three';
import { CellType, Direction, GameColor, Tool } from '../types';
import { Grid } from '../core/Grid';
import { opposite, ALL_DIRECTIONS } from '../utils/direction';
import { Renderer } from '../rendering/Renderer';
import { RoadSystem } from '../systems/RoadSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { ObstacleSystem } from '../systems/ObstacleSystem';
import { buildConfig, MOUNTAIN_MIN_HEIGHT, MOUNTAIN_MAX_HEIGHT } from '../constants';
import { InputHandler } from '../input/InputHandler';
import { RoadDrawer } from '../input/RoadDrawer';
import { exportMapConfig } from './exportMapConfig';
import type { MapConfig, ObstacleDefinition } from '../maps/types';

export const DesignerTool = {
  Road: 0,
  Eraser: 1,
  House: 2,
  Business: 3,
  Obstacle: 4,
} as const;
export type DesignerTool = (typeof DesignerTool)[keyof typeof DesignerTool];

export class MapDesigner {
  private webglRenderer: THREE.WebGLRenderer;
  private grid: Grid;
  private renderer: Renderer;
  private roadSystem: RoadSystem;
  private spawnSystem: SpawnSystem;
  private obstacleSystem: ObstacleSystem;
  private input: InputHandler;
  private roadDrawer: RoadDrawer;
  private canvas: HTMLCanvasElement;
  private animationId = 0;
  private disposed = false;
  private paused = false;

  // Pan/zoom state
  private spaceDown = false;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  // Designer state
  activeTool: DesignerTool = DesignerTool.Road;
  activeColor: GameColor = GameColor.Red;
  houseConnectorDir: Direction = Direction.Down;
  businessOrientation: 'horizontal' | 'vertical' = 'horizontal';
  businessConnectorSide: 'positive' | 'negative' = 'positive';
  obstacleType: 'mountain' | 'lake' = 'mountain';

  // Callbacks
  onToolChange: (() => void) | null = null;

  // Event listener references for cleanup
  private resizeHandler: () => void;
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private mousedownHandler: (e: MouseEvent) => void;
  private mousemoveHandler: (e: MouseEvent) => void;
  private mouseupHandler: (e: MouseEvent) => void;
  private wheelHandler: (e: WheelEvent) => void;
  private contextMenuHandler: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const cfg = buildConfig({
      MOUNTAIN_CLUSTER_COUNT: 0,
      LAKE_CLUSTER_COUNT: 0,
    });

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: !isSafari });
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;

    this.grid = new Grid(cfg.GRID_COLS, cfg.GRID_ROWS);

    // ObstacleSystem with empty predefined (no random gen)
    this.obstacleSystem = new ObstacleSystem(this.grid, [], cfg);
    this.obstacleSystem.generate();

    this.roadSystem = new RoadSystem(this.grid);

    // SpawnSystem with a dummy DemandSystem
    const dummyDemand = { getColorPinOutputRate: () => 0 } as any;
    this.spawnSystem = new SpawnSystem(this.grid, dummyDemand, cfg);
    this.spawnSystem.unlockAllColors();

    this.renderer = new Renderer(
      this.webglRenderer,
      this.grid,
      () => this.spawnSystem.getHouses(),
      () => this.spawnSystem.getBusinesses(),
    );
    this.renderer.buildObstacles(
      this.obstacleSystem.getMountainCells(),
      this.obstacleSystem.getMountainHeightMap(),
      this.obstacleSystem.getLakeCells(),
    );
    this.renderer.resize(window.innerWidth, window.innerHeight);

    this.input = new InputHandler(
      canvas,
      (sx, sy) => this.renderer.screenToWorld(sx, sy),
    );

    const infiniteMoney = { canAfford: () => true, spend: () => {}, refund: () => {} };
    this.roadDrawer = new RoadDrawer(
      this.input, this.roadSystem, this.grid,
      infiniteMoney,
      () => this.spawnSystem.getHouses(),
      null,
      () => this.activeTool === DesignerTool.Eraser ? Tool.Eraser : Tool.Road,
    );
    this.roadDrawer.onTryErase = (gx, gy) => {
      this.eraseAt(gx, gy);
      return true;
    };

    // Wheel: pan/zoom
    this.wheelHandler = (e) => this.renderer.onWheel(e);
    canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    // Resize
    this.resizeHandler = () => {
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.resizeHandler);

    // Keyboard
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') this.renderer.zoomByKey(1);
      if (e.key === '-') this.renderer.zoomByKey(-1);
      if (e.key === 'r' || e.key === 'R') this.setTool(DesignerTool.Road);
      if (e.key === 'e' || e.key === 'E') this.setTool(DesignerTool.Eraser);
      if (e.key === 'h' || e.key === 'H') this.setTool(DesignerTool.House);
      if (e.key === 'b' || e.key === 'B') this.setTool(DesignerTool.Business);
      if (e.key === 'o' || e.key === 'O') this.setTool(DesignerTool.Obstacle);
      if (e.key >= '1' && e.key <= '6') {
        const colors = [GameColor.Red, GameColor.Blue, GameColor.Yellow, GameColor.Green, GameColor.Purple, GameColor.Orange];
        this.activeColor = colors[parseInt(e.key) - 1];
        this.onToolChange?.();
      }
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        this.spaceDown = true;
        this.input.panningActive = true;
        this.canvas.style.cursor = 'grab';
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.keyupHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        this.spaceDown = false;
        this.isPanning = false;
        this.input.panningActive = false;
        this.canvas.style.cursor = this.getCursorForTool();
      }
    };
    window.addEventListener('keyup', this.keyupHandler);

    // Mouse: space+drag pan, left-click placement for non-road tools
    this.mousedownHandler = (e: MouseEvent) => {
      if (this.spaceDown && e.button === 0) {
        this.isPanning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      const pos = this.input.state.gridPos;

      if (e.button === 0) {
        // Left click — only handle non-road tools here; Road/Eraser handled by RoadDrawer
        if (this.activeTool === DesignerTool.House) {
          this.placeHouse(pos.gx, pos.gy);
        } else if (this.activeTool === DesignerTool.Business) {
          this.placeBusiness(pos.gx, pos.gy);
        } else if (this.activeTool === DesignerTool.Obstacle) {
          this.placeObstacle(pos.gx, pos.gy);
        }
      }
    };
    canvas.addEventListener('mousedown', this.mousedownHandler);

    this.mousemoveHandler = (e: MouseEvent) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPanX;
        const dy = e.clientY - this.lastPanY;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        const zoom = this.renderer.getCurrentZoom();
        this.renderer.panBy(-dx / zoom, -dy / zoom);
        return;
      }

      if (this.activeTool === DesignerTool.Obstacle && (e.buttons & 1)) {
        const pos = this.input.state.gridPos;
        this.placeObstacle(pos.gx, pos.gy);
      }
      // Road/Eraser drag handled by RoadDrawer.update()
    };
    canvas.addEventListener('mousemove', this.mousemoveHandler);

    this.mouseupHandler = (e: MouseEvent) => {
      if (e.button === 0 && this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.spaceDown ? 'grab' : this.getCursorForTool();
      }
      // Road/Eraser mouseup handled by RoadDrawer.update()
    };
    canvas.addEventListener('mouseup', this.mouseupHandler);

    this.contextMenuHandler = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', this.contextMenuHandler);

    this.renderer.markGroundDirty();
  }

  start(): void {
    const loop = () => {
      if (this.disposed || this.paused) return;
      this.roadDrawer.update();
      if (this.roadSystem.isDirty) {
        this.roadSystem.clearDirty();
        this.renderer.markGroundDirty();
      }
      this.renderer.updateIndicator(this.roadDrawer.getLastBuiltPos());
      this.renderer.render(
        0,
        this.spawnSystem.getHouses(),
        this.spawnSystem.getBusinesses(),
        [],
      );
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.webglRenderer.dispose();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    this.canvas.removeEventListener('mousemove', this.mousemoveHandler);
    this.canvas.removeEventListener('mouseup', this.mouseupHandler);
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  setTool(tool: DesignerTool): void {
    this.activeTool = tool;
    this.canvas.style.cursor = this.getCursorForTool();
    this.onToolChange?.();
  }

  private getCursorForTool(): string {
    if (this.activeTool === DesignerTool.Eraser) return 'crosshair';
    return 'default';
  }

  placeHouse(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Empty) return;

    // Check connector cell is empty
    const off = this.grid.getDirectionOffset(this.houseConnectorDir);
    const cx = gx + off.gx;
    const cy = gy + off.gy;
    const connCell = this.grid.getCell(cx, cy);
    if (!connCell || connCell.type !== CellType.Empty) return;

    this.spawnSystem.spawnHouse({ gx, gy }, this.activeColor, this.houseConnectorDir);
    this.renderer.markGroundDirty();
  }

  placeBusiness(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Empty) return;

    // Check parking lot and connector cells
    let parkGx: number, parkGy: number, connGx: number, connGy: number;
    if (this.businessOrientation === 'horizontal') {
      parkGx = gx + 1;
      parkGy = gy;
      connGx = gx + 1;
      connGy = gy + (this.businessConnectorSide === 'positive' ? 1 : -1);
    } else {
      parkGx = gx;
      parkGy = gy + 1;
      connGx = gx + (this.businessConnectorSide === 'positive' ? 1 : -1);
      connGy = gy + 1;
    }

    const parkCell = this.grid.getCell(parkGx, parkGy);
    const connCell = this.grid.getCell(connGx, connGy);
    if (!parkCell || parkCell.type !== CellType.Empty) return;
    if (!connCell || connCell.type !== CellType.Empty) return;

    this.spawnSystem.spawnBusiness({ gx, gy }, this.activeColor, this.businessOrientation, this.businessConnectorSide);
    this.renderer.markGroundDirty();
  }

  placeObstacle(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell || cell.type !== CellType.Empty) return;

    if (this.obstacleType === 'mountain') {
      this.grid.setCell(gx, gy, { type: CellType.Mountain });
      const height = MOUNTAIN_MIN_HEIGHT + Math.random() * (MOUNTAIN_MAX_HEIGHT - MOUNTAIN_MIN_HEIGHT);
      this.obstacleSystem.getMountainHeightMap().set(`${gx},${gy}`, height);
      this.obstacleSystem.getMountainCells().push({ gx, gy });
    } else {
      this.grid.setCell(gx, gy, { type: CellType.Lake });
      this.obstacleSystem.getLakeCells().push({ gx, gy });
    }

    this.rebuildObstacles();
  }

  eraseAt(gx: number, gy: number): void {
    const cell = this.grid.getCell(gx, gy);
    if (!cell) return;

    if (cell.type === CellType.Road) {
      this.roadSystem.removeRoad(gx, gy);
      this.renderer.markGroundDirty();
      return;
    }

    // Only allow erasing by clicking directly on the House or Business cell
    if (cell.type === CellType.House || cell.type === CellType.Business) {
      if (cell.entityId) {
        this.eraseEntity(cell.entityId);
        this.renderer.markGroundDirty();
      }
      return;
    }

    // Connectors and parking lots are not directly erasable
    if (cell.type === CellType.Connector || cell.type === CellType.ParkingLot) {
      return;
    }

    if (cell.type === CellType.Mountain) {
      this.grid.setCell(gx, gy, {
        type: CellType.Empty,
        entityId: null,
        roadConnections: 0,
        color: null,
        connectorDir: null,
        pendingDeletion: false,
      });
      const cells = this.obstacleSystem.getMountainCells();
      const idx = cells.findIndex(c => c.gx === gx && c.gy === gy);
      if (idx !== -1) cells.splice(idx, 1);
      this.obstacleSystem.getMountainHeightMap().delete(`${gx},${gy}`);
      this.rebuildObstacles();
      return;
    }

    if (cell.type === CellType.Lake) {
      this.grid.setCell(gx, gy, {
        type: CellType.Empty,
        entityId: null,
        roadConnections: 0,
        color: null,
        connectorDir: null,
        pendingDeletion: false,
      });
      const cells = this.obstacleSystem.getLakeCells();
      const idx = cells.findIndex(c => c.gx === gx && c.gy === gy);
      if (idx !== -1) cells.splice(idx, 1);
      this.rebuildObstacles();
      return;
    }
  }

  private eraseEntity(entityId: string): void {
    // Find and remove a house
    const house = this.spawnSystem.getHouses().find(h => h.id === entityId);
    if (house) {
      this.clearCell(house.pos.gx, house.pos.gy);
      this.clearConnectorCell(house.connectorPos.gx, house.connectorPos.gy);
      this.spawnSystem.removeHouse(entityId);
      return;
    }

    // Find and remove a business
    const business = this.spawnSystem.getBusinesses().find(b => b.id === entityId);
    if (business) {
      this.clearCell(business.pos.gx, business.pos.gy);
      this.clearCell(business.parkingLotPos.gx, business.parkingLotPos.gy);
      this.clearConnectorCell(business.connectorPos.gx, business.connectorPos.gy);
      this.spawnSystem.removeBusiness(entityId);
      return;
    }
  }

  private clearCell(gx: number, gy: number): void {
    this.grid.setCell(gx, gy, {
      type: CellType.Empty,
      entityId: null,
      roadConnections: 0,
      color: null,
      connectorDir: null,
      pendingDeletion: false,
    });
  }

  private clearConnectorCell(gx: number, gy: number): void {
    // Disconnect any road neighbors pointing into this cell
    for (const dir of ALL_DIRECTIONS) {
      const neighbor = this.grid.getNeighbor(gx, gy, dir);
      if (neighbor && neighbor.cell.type === CellType.Road) {
        const oppDir = opposite(dir);
        neighbor.cell.roadConnections &= ~oppDir;
      }
    }
    this.clearCell(gx, gy);
    this.roadSystem.markDirty();
  }


  private rebuildObstacles(): void {
    // Rebuild the 3D obstacle rendering
    this.renderer.dispose();

    // Re-create renderer to get fresh ground mesh for lake displacement
    this.renderer = new Renderer(
      this.webglRenderer,
      this.grid,
      () => this.spawnSystem.getHouses(),
      () => this.spawnSystem.getBusinesses(),
    );
    this.renderer.buildObstacles(
      this.obstacleSystem.getMountainCells(),
      this.obstacleSystem.getMountainHeightMap(),
      this.obstacleSystem.getLakeCells(),
    );
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.renderer.markGroundDirty();
  }

  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.animationId);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  toMapConfig(): MapConfig {
    const houses = this.spawnSystem.getHouses().map(h => ({
      gx: h.pos.gx,
      gy: h.pos.gy,
      color: h.color,
      connectorDir: h.connectorDir,
    }));

    const businesses = this.spawnSystem.getBusinesses().map(b => ({
      gx: b.pos.gx,
      gy: b.pos.gy,
      color: b.color,
      orientation: b.orientation,
      connectorSide: b.connectorSide,
    }));

    const roads: { gx: number; gy: number; connections?: number }[] = [];
    for (let gy = 0; gy < this.grid.rows; gy++) {
      for (let gx = 0; gx < this.grid.cols; gx++) {
        const cell = this.grid.getCell(gx, gy);
        if (cell && cell.type === CellType.Road) {
          roads.push({
            gx,
            gy,
            connections: cell.roadConnections,
          });
        }
      }
    }

    const obstacles: ObstacleDefinition[] = [
      ...this.obstacleSystem.getMountainCells().map(c => ({
        gx: c.gx,
        gy: c.gy,
        type: 'mountain' as const,
        height: this.obstacleSystem.getMountainHeightMap().get(`${c.gx},${c.gy}`),
      })),
      ...this.obstacleSystem.getLakeCells().map(c => ({
        gx: c.gx,
        gy: c.gy,
        type: 'lake' as const,
      })),
    ];

    return {
      id: 'designer-test',
      name: 'Designer Test',
      description: 'Test play from Map Designer',
      houses,
      businesses,
      roads,
      obstacles: obstacles.length > 0 ? obstacles : [],
      constants: {
        STARTING_MONEY: 99999,
        SPAWN_INTERVAL: 999999,
        MIN_SPAWN_INTERVAL: 999999,
        MOUNTAIN_CLUSTER_COUNT: 0,
        LAKE_CLUSTER_COUNT: 0,
      },
    };
  }

  exportConfig(): string {
    return exportMapConfig(
      this.grid,
      this.spawnSystem.getHouses(),
      this.spawnSystem.getBusinesses(),
      this.obstacleSystem.getMountainCells(),
      this.obstacleSystem.getMountainHeightMap(),
      this.obstacleSystem.getLakeCells(),
    );
  }
}
