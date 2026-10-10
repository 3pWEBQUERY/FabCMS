/**
 * Phones show admin tables as one card per row (see `.table` in app.css). A
 * card has no header row, so every cell carries its column's name as
 * `data-label` (and `data-blank` when it is empty). Filled in from the header for every table – also ones that
 * render later or change their columns.
 */
export function labelTableCells(root: ParentNode = document): void {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.table')) {
    const labels: string[] = [];
    for (const th of table.tHead?.rows[0]?.cells ?? []) {
      const text = th.textContent?.trim() ?? '';
      for (let i = 0; i < th.colSpan; i++) labels.push(text);
    }
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        let col = 0;
        for (const cell of row.cells) {
          const label = labels[col] ?? '';
          if (cell.dataset.label !== label) cell.dataset.label = label;
          // «–» says «nothing here» in a table; on a card the line is simply left out.
          const blank = !cell.querySelector('img, svg, input, button') && ['', '–', '-'].includes(cell.textContent?.trim() ?? '');
          if (blank !== cell.hasAttribute('data-blank')) cell.toggleAttribute('data-blank', blank);
          col += cell.colSpan;
        }
      }
    }
  }
}

export function watchTableCards(): void {
  let queued = false;
  const run = () => {
    queued = false;
    labelTableCells();
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  run();
}
