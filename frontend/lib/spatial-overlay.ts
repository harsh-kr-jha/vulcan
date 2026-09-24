export interface ScreenAnchor {
  /** CSS pixels from the visualization container's left edge. */
  x: number;
  /** CSS pixels from the visualization container's top edge. */
  y: number;
  /** False when the world anchor is outside the active camera/viewport. */
  visible: boolean;
}
