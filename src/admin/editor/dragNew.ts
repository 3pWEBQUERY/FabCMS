import type { DragEvent } from 'react';

/**
 * The builder's side bar: elements and sections dragged onto the canvas. The
 * canvas (bridge.ts) reads these types while dragging and posts «drop-new».
 */
export const NEW_EL = 'application/x-nova-el';
export const NEW_BLOCK = 'application/x-nova-block';

/** Makes a button draggable onto the canvas, carrying `data` – only where `on` (the side bar). */
export const dragSource = (on: boolean | undefined, type: string, data: Record<string, unknown>) =>
  on
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          e.dataTransfer.setData(type, JSON.stringify(data));
          e.dataTransfer.effectAllowed = 'copy';
        },
      }
    : {};
