import type { GridPos } from '../types';
import { TILE_SIZE } from '../constants';

export interface InputState {
  leftDown: boolean;
  rightDown: boolean;
  gridPos: GridPos;
  canvasX: number;
  canvasY: number;
}

export class InputHandler {
  readonly state: InputState = {
    leftDown: false,
    rightDown: false,
    gridPos: { gx: -1, gy: -1 },
    canvasX: 0,
    canvasY: 0,
  };

  private scaleX = 1;
  private scaleY = 1;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindEvents();
  }

  updateScale(scaleX: number, scaleY: number): void {
    this.scaleX = scaleX;
    this.scaleY = scaleY;
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updatePosition(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.state.canvasX = (e.clientX - rect.left) * this.scaleX;
    this.state.canvasY = (e.clientY - rect.top) * this.scaleY;
    this.state.gridPos = {
      gx: Math.floor(this.state.canvasX / TILE_SIZE),
      gy: Math.floor(this.state.canvasY / TILE_SIZE),
    };
  }

  private onMouseDown(e: MouseEvent): void {
    this.updatePosition(e);
    if (e.button === 0) this.state.leftDown = true;
    if (e.button === 2) this.state.rightDown = true;
  }

  private onMouseUp(e: MouseEvent): void {
    this.updatePosition(e);
    if (e.button === 0) this.state.leftDown = false;
    if (e.button === 2) this.state.rightDown = false;
  }

  private onMouseMove(e: MouseEvent): void {
    this.updatePosition(e);
  }

  private onMouseLeave(): void {
    this.state.leftDown = false;
    this.state.rightDown = false;
  }
}
