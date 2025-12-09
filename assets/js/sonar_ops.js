(function () {
  const aspectEl = document.getElementById('aspectRatio');
  const rowsEl = document.getElementById('rows');
  const colsEl = document.getElementById('cols');
  const buildBtn = document.getElementById('buildBtn');
  const controls = document.getElementById('controls');
  const gridHolder = document.getElementById('gridHolder');
  const sonarOps = document.getElementById('sonarOps');
  const squareHint = document.getElementById('squareHint');
  const valueInput = document.getElementById('valueInput');
  const addValueBtn = document.getElementById('addValueBtn');
  const valuesBody = document.getElementById('valuesBody');
  const strategyEl = document.getElementById('strategySelect');
  // Modal elements
  const cellModal = document.getElementById('cellModal');
  const modalYes = document.getElementById('modalYes');
  const modalNo = document.getElementById('modalNo');
  const modalCancel = document.getElementById('modalCancel');
  const modalText = document.getElementById('modalText');

  // Overrides map: key `${r},${c}` -> 0 or 1; persists until grid is rebuilt
  let useroverrides = {};
  let overrides = {};
  let currentmap = {}; // 0: unknown, 1: miss, 2: hit
  let pendingCell = null; // { r, c }
  let currentMode = 0;
  let lasthit = null;

  function setInitialState() {
    // Default to square: disable columns, show hint
    if (aspectEl.value === 'square') {
      colsEl.disabled = true;
      squareHint.style.display = 'block';
    } else {
      colsEl.disabled = false;
      squareHint.style.display = 'none';
    }
  }

  function handleAspectChange() {
    if (aspectEl.value === 'square') {
      colsEl.value = '';
      colsEl.disabled = true;
      squareHint.style.display = 'block';
    } else {
      colsEl.disabled = false;
      squareHint.style.display = 'none';
    }
  }

  function clampInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? NaN : Math.max(1, n);
  }

  function parseAnyInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }

  function sortValuesTable() {
    const rows = Array.from(valuesBody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const av = parseInt(a.firstChild.textContent, 10);
      const bv = parseInt(b.firstChild.textContent, 10);
      if (isNaN(av) && isNaN(bv)) return 0;
      if (isNaN(av)) return 1;
      if (isNaN(bv)) return -1;
      return av - bv;
    });
    // Re-append in sorted order
    valuesBody.innerHTML = '';
    rows.forEach(r => valuesBody.appendChild(r));
  }

  function updateHeatmap(mode, x, y) {
    // If grid not yet built, nothing to update
    const grid = gridHolder.querySelector('.grid');
    if (!grid) return;

    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    const cols = isSquare ? rows : clampInt(colsEl.value);
    if (isNaN(rows) || isNaN(cols)) return;

    // Build boats array from table
    const boats = Array.from(valuesBody.querySelectorAll('tr'))
      .filter((tr) => !tr.classList.contains('destroyed'))
      .map((tr) => parseInt(tr.firstChild.textContent, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const strategy = strategyEl ? parseAnyInt(strategyEl.value) : 0;
    const probs = (window.sonarRules && window.sonarRules.generateHeatmap)
      ? window.sonarRules.generateHeatmap(strategy, rows, cols, boats, currentmap, mode, x, y)
      : Array.from({ length: rows }, () => Array(cols).fill(0));

    // Apply colors and labels to existing cells (respect overrides)
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const p = key in overrides ? overrides[key] : probs[r][c];
        const g = Math.max(0, Math.min(255, Math.round(255 * (1 - p))));
        const cell = grid.children[idx++];
        if (!cell) break;
        // apply UX border classes
        cell.classList.remove('cell-hit', 'cell-miss');
        if (key in useroverrides) {
          if (useroverrides[key] === 1) cell.classList.add('cell-hit');
          else if (useroverrides[key] === 0) cell.classList.add('cell-miss');
        }
        cell.style.backgroundColor = `rgb(${g}, ${g}, ${g})`;
        const span = cell.firstChild;
        if (span) {
          span.textContent = (p > 0 ? p.toFixed(2) : '');
          // If probability is above 0.33, use white font for readability
          span.style.color = (p > 0.33 ? '#ffffff' : '#111111');
        }
      }
    }
  }

  function buildGrid() {
    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    let cols = clampInt(colsEl.value);

    if (isSquare) {
      if (isNaN(rows)) {
        alert('Please enter a valid number of rows for square grid.');
        rowsEl.focus();
        return;
      }
      cols = rows; // mirror rows for square
    } else {
      if (isNaN(rows) || isNaN(cols)) {
        alert('Please enter valid integers for rows and columns.');
        if (isNaN(rows)) rowsEl.focus(); else colsEl.focus();
        return;
      }
    }

    // Prepare UI layout and animations
    sonarOps.classList.add('two-col');
    controls.classList.add('shift-left');

    // Build grid
    const grid = document.createElement('div');
    grid.className = 'grid';

    // Compute cell size to fit without overflow
    // Account for grid gap of 6px
    const GAP = 6;
    // Ensure holder has computed size in two-col layout
    const holderWidth = gridHolder.clientWidth;
    const holderHeight = gridHolder.clientHeight;
    const cellWidth = Math.floor((holderWidth - GAP * (cols - 1)) / cols);
    const cellHeight = Math.floor((holderHeight - GAP * (rows - 1)) / rows);
    const cellSize = Math.max(1, Math.min(cellWidth, cellHeight));

    grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      // explicit sizing ensures no overflow
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      // small label for probability
      const label = document.createElement('span');
      label.style.fontSize = '10px';
      label.style.color = '#111';
      label.style.display = 'block';
      label.style.textAlign = 'center';
      label.style.lineHeight = `${cellSize}px`;
      cell.appendChild(label);
      // Attach click to open modal and set pending cell
      const r = Math.floor(i / cols);
      const c = i % cols;
      cell.addEventListener('click', function () {
        pendingCell = { r, c };
        if (modalText) modalText.textContent = `Was there a boat in cell (${r + 1}, ${c + 1})?`;
        if (cellModal) cellModal.hidden = false;
      });
      grid.appendChild(cell);
    }

    // Replace content with new grid and reset overrides
    useroverrides = {};
    overrides = {};
    currentmap = Array.from({ length: rows }, () => Array(cols).fill(0));
    gridHolder.innerHTML = '';
    gridHolder.appendChild(grid);

    // Compute heatmap probabilities from boats table
    const boats = Array.from(document.querySelectorAll('#valuesBody tr'))
      .filter((tr) => !tr.classList.contains('destroyed'))
      .map((tr) => parseInt(tr.firstChild.textContent, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    const strategy = strategyEl ? parseAnyInt(strategyEl.value) : 0;
    const probs = (window.sonarRules && window.sonarRules.generateHeatmap)
      ? window.sonarRules.generateHeatmap(strategy, rows, cols, boats, currentmap, currentMode, 0, 0)
      : Array.from({ length: rows }, () => Array(cols).fill(0));

    // Render heatmap colors; black=1, white=0, gray in-between (respect overrides)
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const p = key in overrides ? overrides[key] : probs[r][c];
        const g = Math.max(0, Math.min(255, Math.round(255 * (1 - p))));
        const cell = grid.children[idx++];
        // apply UX border classes
        cell.classList.remove('cell-hit', 'cell-miss');
        if (key in useroverrides) {
          if (useroverrides[key] === 1) cell.classList.add('cell-hit');
          else if (useroverrides[key] === 0) cell.classList.add('cell-miss');
        }
        cell.style.backgroundColor = `rgb(${g}, ${g}, ${g})`;
        const span = cell.firstChild;
        if (span) {
          span.textContent = (p > 0 ? p.toFixed(2) : '');
          // If probability is above 0.33, use white font for readability
          span.style.color = (p > 0.33 ? '#ffffff' : '#111111');
        }
      }
    }

    // Reveal grid
    requestAnimationFrame(() => {
      gridHolder.classList.add('visible');
    });
  }

  // Modal actions
  if (modalYes) {
    modalYes.addEventListener('click', function () {
      if (pendingCell) {
        // Cache coords BEFORE clearing pendingCell
        const pr = pendingCell.r;
        const pc = pendingCell.c;
        useroverrides[`${pr},${pc}`] = 1;
        overrides[`${pr},${pc}`] = 1;
        currentmap[pr][pc] = 2;
        cellModal.hidden = true;
        pendingCell = null;
        // Auto-destroy detection: compute longest contiguous line through hits
        const isSquare = aspectEl.value === 'square';
        const rows = clampInt(rowsEl.value);
        const cols = isSquare ? rows : clampInt(colsEl.value);
        function longestFrom(r, c) {
          let h = 1, v = 1;
          // left
          for (let cc = c - 1; cc >= 0 && useroverrides[`${r},${cc}`] === 1; cc--) h++;
          // right
          for (let cc = c + 1; cc < cols && useroverrides[`${r},${cc}`] === 1; cc++) h++;
          // up
          for (let rr = r - 1; rr >= 0 && useroverrides[`${rr},${c}`] === 1; rr--) v++;
          // down
          for (let rr = r + 1; rr < rows && useroverrides[`${rr},${c}`] === 1; rr++) v++;
          return Math.max(h, v);
        }
        const L = longestFrom(pr, pc);
        currentMode = 1;
        lasthit = { r: pr, c: pc };
        // Check if a boat of length L exists and is not destroyed
        const rowsEls = Array.from(document.querySelectorAll('#valuesBody tr'));
        const candidates = rowsEls.filter(tr => !tr.classList.contains('destroyed') && parseInt(tr.firstChild.textContent, 10) === L);
        if (candidates.length > 0) {
          const answer = window.confirm(`Mark a boat of length ${L} as destroyed?`);
          if (answer) {
            candidates[0].classList.add('destroyed');
            currentMode = 0;

            let length = parseAnyInt(candidates[0].firstChild.textContent, 10);
            if (length !== null) { 
              let shipx = [];
              let shipy = [];
              let count = 0;
              for (let r = pr; r < rows; r++) {
                if (currentmap[r][pc] === 2) {
                  shipy.push(r);
                  shipx.push(pc);
                  count++;
                } else {
                  break;
                }
              }

              for (let r = pr - 1; r >= 0; r--) {
                if (currentmap[r][pc] === 2) {
                  shipy.push(r);
                  shipx.push(pc);
                  count++;
                } else {
                  break;
                }
              }

              if (count !== length) {
                shipx = [];
                shipy = [];
                count = 0;

                for (let c = pc; c < cols; c++) {
                  if (currentmap[pr][c] === 2) {
                    shipy.push(pr);
                    shipx.push(c);
                    count++;
                  } else {
                    break;
                  }
                }

                for (let c = pc - 1; c >= 0; c--) {
                  if (currentmap[pr][c] === 2) {
                    shipy.push(pr);
                    shipx.push(c);
                    count++;
                  } else {
                    break;
                  }
                }
              }

              if (count !== length) {
                throw new Error('Internal error: hit count does not match boat length.');
              }

              for (let i = 0; i < shipx.length; i++) {
                if (currentmap[shipy[i]][shipx[i]] === 2) {
                  if (shipy[i] - 1 >= 0 && currentmap[shipy[i] - 1][shipx[i]] === 0) {
                    currentmap[shipy[i] - 1][shipx[i]] = 1;
                  }
                  if (shipy[i] + 1 < rows && currentmap[shipy[i] + 1][shipx[i]] === 0) {
                    currentmap[shipy[i] + 1][shipx[i]] = 1;
                  }
                  if (shipx[i] - 1 >= 0 && currentmap[shipy[i]][shipx[i] - 1] === 0) {
                    currentmap[shipy[i]][shipx[i] - 1] = 1;
                  }
                  if (shipx[i] + 1 < cols && currentmap[shipy[i]][shipx[i] + 1] === 0) {
                    currentmap[shipy[i]][shipx[i] + 1] = 1;
                  }
                  if (shipy[i] - 1 >= 0 && shipx[i] - 1 >= 0 && currentmap[shipy[i] - 1][shipx[i] - 1] === 0) {
                    currentmap[shipy[i] - 1][shipx[i] - 1] = 1;
                  }
                  if (shipy[i] - 1 >= 0 && shipx[i] + 1 < cols && currentmap[shipy[i] - 1][shipx[i] + 1] === 0) {
                    currentmap[shipy[i] - 1][shipx[i] + 1] = 1;
                  }
                  if (shipy[i] + 1 < rows && shipx[i] - 1 >= 0 && currentmap[shipy[i] + 1][shipx[i] - 1] === 0) {
                    currentmap[shipy[i] + 1][shipx[i] - 1] = 1;
                  }
                  if (shipy[i] + 1 < rows && shipx[i] + 1 < cols && currentmap[shipy[i] + 1][shipx[i] + 1] === 0) {
                    currentmap[shipy[i] + 1][shipx[i] + 1] = 1;
                  }
                }
              }
              
              console.table(currentmap);
            }
          }
        }
        // Also auto-mark destroyed if contiguous hits reach any boat length
        const remaining = rowsEls.filter(tr => !tr.classList.contains('destroyed')).map(tr => parseInt(tr.firstChild.textContent, 10));
        if (remaining.includes(L)) {
          // already asked above; if user declined, keep; otherwise it's marked.
        }
        updateHeatmap(currentMode, pr, pc);
      }
    });
  }
  if (modalNo) {
    modalNo.addEventListener('click', function () {
      if (pendingCell) {
        useroverrides[`${pendingCell.r},${pendingCell.c}`] = 0;
        overrides[`${pendingCell.r},${pendingCell.c}`] = 0;
        currentmap[pendingCell.r][pendingCell.c] = 1;
        cellModal.hidden = true;
        pendingCell = null;

        if (currentMode !== 0) {
          updateHeatmap(3, lasthit.r, lasthit.c);
          return;
        }
        updateHeatmap(currentMode, 0, 0);
      }
    });
  }
  if (modalCancel) {
    modalCancel.addEventListener('click', function () {
      cellModal.hidden = true;
      pendingCell = null;
    });
  }

  // Events
  aspectEl.addEventListener('change', handleAspectChange);
  buildBtn.addEventListener('click', buildGrid);
  addValueBtn.addEventListener('click', function () {
    const v = parseAnyInt(valueInput.value);
    if (v === null) {
      alert('Please enter a valid boat count (integer).');
      valueInput.focus();
      return;
    }
    // Validate against current rows/cols settings: boat count must be <= rows and <= cols
    const isSquare = aspectEl.value === 'square';
    const rows = clampInt(rowsEl.value);
    const colsCandidate = isSquare ? rows : clampInt(colsEl.value);
    if (isNaN(rows) || isNaN(colsCandidate)) {
      alert('Please set valid rows and columns before adding boats.');
      return;
    }
    const maxAllowed = Math.min(rows, colsCandidate);
    if (v > maxAllowed) {
      alert(`Boat value cannot exceed ${maxAllowed} (rows and columns constraint).`);
      valueInput.focus();
      return;
    }
    const tr = document.createElement('tr');
    const tdVal = document.createElement('td');
    const tdAct = document.createElement('td');
    tdVal.textContent = String(v);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-sm btn-danger';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function () {
      tr.remove();
      // Repaint heatmap after deletion
      updateHeatmap(0, 0, 0);
    });
    tdAct.appendChild(removeBtn);
    tr.appendChild(tdVal);
    tr.appendChild(tdAct);
    valuesBody.appendChild(tr);
    sortValuesTable();
    valueInput.value = '';
    valueInput.focus();
    // Update heatmap to reflect new boats list
    updateHeatmap(0, 0, 0);
  });

  // Init
  setInitialState();
})();
