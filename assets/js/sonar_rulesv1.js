(function () {
  // Simple heuristic heatmap generator for boats placed horizontally/vertically.
  // Boats are represented as integer lengths.
  // Overrides can constrain placements: cells marked 0 cannot be part of any placement,
  // and if any cell is marked 1, we prefer placements that include at least one 1-cell.
  // mode: 0 = miss, 1 = hit
  function generateHeatmap(strategy, rows, cols, boats, overrides, mode, x, y) {
    // Enumerate candidate placements per boat and sample valid configurations.
    if (strategy === 0)
      return generateHeatmapWithRules(rows, cols, boats, overrides, mode, x, y);
    if (strategy === 1)
      return generateHeatmapsWithSimulation(rows, cols, boats, overrides);
  }

  function generateHeatmapsWithSimulation(rows, cols, boats, overrides) {
    // Enumerate candidate placements per boat and sample valid configurations.
    const MAX_SAMPLES = Math.min(8000, 1200 + rows * cols * 4);
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    const zeros = new Set();
    const ones = new Set();
    if (overrides && typeof overrides === 'object') {
      for (const key in overrides) {
        if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
        const val = overrides[key];
        const parts = key.split(',');
        const r = parseInt(parts[0], 10);
        const c = parseInt(parts[1], 10);
        if (Number.isInteger(r) && Number.isInteger(c)) {
          if (val === 0) zeros.add(key);
          else if (val === 1) ones.add(key);
        }
      }
    }

    function canPlace(board, r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) return false;
        const key = `${rr},${cc}`;
        if (zeros.has(key)) return false;
        if (board[rr][cc] === 1) return false; // occupied
        // separation: ensure neighbors are empty
        const neigh = [
          [rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1],
          [rr - 1, cc - 1], [rr - 1, cc + 1], [rr + 1, cc - 1], [rr + 1, cc + 1]
        ];
        for (const [nr, nc] of neigh) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (board[nr][nc] === 1) return false;
          }
        }
      }
      return true;
    }

    function place(board, r, c, len, vertical) {
      for (let k = 0; k < len; k++) {
        const rr = vertical ? r + k : r;
        const cc = vertical ? c : c + k;
        board[rr][cc] = 1;
      }
    }

    // Build candidate placement lists for each boat instance
    const boatPlacements = boats.map((len) => {
      const candidates = [];
      // Horizontal
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c + len - 1 < cols; c++) {
          // quick zero check
          let ok = true;
          for (let k = 0; k < len; k++) {
            if (zeros.has(`${r},${c + k}`)) { ok = false; break; }
          }
          if (!ok) continue;
          candidates.push({ r, c, len, vertical: false });
        }
      }
      // Vertical
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r + len - 1 < rows; r++) {
          let ok = true;
          for (let k = 0; k < len; k++) {
            if (zeros.has(`${r + k},${c}`)) { ok = false; break; }
          }
          if (!ok) continue;
          candidates.push({ r, c, len, vertical: true });
        }
      }
      return candidates;
    });

    // Order boats by fewest candidates to prune early
    const order = boats.map((len, i) => i)
      .sort((a, b) => boatPlacements[a].length - boatPlacements[b].length);

    let samples = 0;
    function backtrack(idx, board) {
      if (samples >= MAX_SAMPLES) return;
      if (idx === order.length) {
        // verify ones coverage
        for (const key of ones) {
          const [r, c] = key.split(',').map((x) => parseInt(x, 10));
          if (board[r][c] !== 1) return; // reject
        }
        // accumulate
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (board[r][c] === 1) counts[r][c] += 1;
          }
        }
        samples++;
        return;
      }
      const i = order[idx];
      // bias candidates if there are known ones
      let candidates = boatPlacements[i];
      if (ones.size > 0) {
        candidates = candidates.slice().sort((A, B) => {
          function dist(a) {
            let best = Infinity;
            for (const key of ones) {
              const [pr, pc] = key.split(',').map(v => parseInt(v, 10));
              for (let k = 0; k < a.len; k++) {
                const rr = a.vertical ? a.r + k : a.r;
                const cc = a.vertical ? a.c : a.c + k;
                const d = Math.abs(rr - pr) + Math.abs(cc - pc);
                if (d < best) best = d;
              }
            }
            return best;
          }
          return dist(A) - dist(B);
        });
      }
      for (const cand of candidates) {
        if (!canPlace(board, cand.r, cand.c, cand.len, cand.vertical)) continue;
        // place
        place(board, cand.r, cand.c, cand.len, cand.vertical);
        backtrack(idx + 1, board);
        // unplace
        for (let k = 0; k < cand.len; k++) {
          const rr = cand.vertical ? cand.r + k : cand.r;
          const cc = cand.vertical ? cand.c : cand.c + k;
          board[rr][cc] = 0;
        }
        if (samples >= MAX_SAMPLES) break;
      }
    }

    const emptyBoard = Array.from({ length: rows }, () => Array(cols).fill(0));
    backtrack(0, emptyBoard);

    // Normalize counts to [0,1] with light Laplace smoothing to avoid collapse
    let maxCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] > maxCount) maxCount = counts[r][c];
      }
    }
    const alpha = 1; // smoothing
    const denom = (maxCount > 0 ? maxCount + alpha : 1);
    const probs = counts.map((row) => row.map((v) => ((v + alpha) / denom)));

    // Apply hard overrides on top (force 0/1)
    // Do not hard-force 0/1 here; rendering layer applies overrides so distribution remains informative.
    return probs;
  }

  function generateHeatmapWithRules(rows, cols, boats, overrides, mode, x, y) {
    // Enumerate candidate placements per boat and sample valid configurations.
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));

    if (x > rows || y > cols) {
      throw new Error('Drop point exceeds defined rows/cols');
    }

    if (mode === 0) {
      boats.forEach(boat => {
        // Try placing the boat in all valid positions
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = c + boat;
            let canPlaceHorizontally = true;
            for (let current = c; current < end; current++) {
              if (current >= cols || overrides[r][current] === 1) {
                canPlaceHorizontally = false;
              }
            }

            if (canPlaceHorizontally) {
              for (let current = c; current < end; current++) {
                counts[r][current] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = r + boat;
            let canPlaceVertically = true;
            for (let current = r; current < end; current++) {
              if (current >= rows || overrides[current][c] === 1) {
                canPlaceVertically = false;
              }
            }
            if (canPlaceVertically) {
              for (let current = r; current < end; current++) {
                counts[current][c] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          let checkerboard = r;
          for (let c = 0; c < cols; c++) {
            if (checkerboard % 2 === 0) {
              counts[r][c] = Math.floor(counts[r][c] * 0.8);
            }
            checkerboard++;
          }
        }
      });
    } else if (mode === 1) {
      updateCountsForPlacement();
    } else if (mode === 3) {
      if (overrides[x][y] === 2) {
        // This happens when a miss is happened in the target mode.
        // Should wonder around to find other hits and try from other end.
        let dir = -1;
        if (x - 1 >= 0 && overrides[x - 1][y] === 2) {
          dir = 0; // up
        } else if (x + 1 < rows && overrides[x + 1][y] === 2) {
          dir = 1; // down
        } else if (y - 1 >= 0 && overrides[x][y - 1] === 2) {
          dir = 2; // left
        } else if (y + 1 < cols && overrides[x][y + 1] === 2) {
          dir = 3; // right
        }

        let xNew = x;
        let yNew = y;

        let start = x;
        switch (dir) {
          case 0: // up
            start = x;
            while (start - 1 >= 0 && overrides[start - 1][y] === 2) {
              start--;
            }
            if (start - 1 < 0)
              throw new Error('No valid placement found for the hit point');
            xNew = start - 1;
            break;
          case 1: // down
            start = x;
            while (start + 1 < rows && overrides[start + 1][y] === 2) {
              start++;
            }
            if (start + 1 >= rows)
              throw new Error('No valid placement found for the hit point');
            xNew = start + 1;
            break;
          case 2: // left
            start = y;
            while (start - 1 >= 0 && overrides[x][start - 1] === 2) {
              start--;
            }
            if (start - 1 < 0)
              throw new Error('No valid placement found for the hit point');
            yNew = start - 1;
            break;
          case 3: // right
            start = y;
            while (start + 1 < cols && overrides[x][start + 1] === 2) {
              start++;
            }
            if (start + 1 >= cols)
              throw new Error('No valid placement found for the hit point');
            yNew = start + 1;
            break;
        }

        if (overrides[xNew][yNew] !== 1) {
          x = xNew;
          y = yNew;
        } else {
          switch (dir) {
            case 0: // up
              if (x + 1 < rows && overrides[x + 1][y] !== 1) {
                x = x + 1;
              }
              break;
            case 1: // down
              if (x - 1 >= 0 && overrides[x - 1][y] !== 1) {
                x = x - 1;
              }
              break;
            case 2: // left
              if (y + 1 < cols && overrides[x][y + 1] !== 1) {
                y = y + 1;
              }
              break;
            case 3: // right
              if (y - 1 >= 0 && overrides[x][y - 1] !== 1) {
                y = y - 1;
              }
              break;
          }

          if (overrides[xNew][yNew] !== 1) {
            x = xNew;
            y = yNew;
          }
        }
      }
      updateCountsForPlacement();
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (overrides[r][c] === 1) {
          counts[r][c] = 0;
        }
      }
    }

    // Normalize counts to [0,1] with light Laplace smoothing to avoid collapse
    let maxCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (counts[r][c] > maxCount) maxCount = counts[r][c];
      }
    }
    const alpha = 0; // smoothing
    const denom = (maxCount > 0 ? maxCount + alpha : 1);
    const probs = counts.map((row) => row.map((v) => ((v + alpha) / denom)));

    // Apply hard overrides on top (force 0/1)
    // Do not hard-force 0/1 here; rendering layer applies overrides so distribution remains informative.
    return probs;

    function updateCountsForPlacement() {      
      boats.forEach(boat => {
        // Try placing the boat in all valid positions that include (x,y)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = c + boat;
            let canPlaceHorizontally = true;
            let includesDropPoint = false;
            let multiplier = 1;

            for (let current = c; current < end; current++) {
              if (current >= cols || overrides[r][current] === 1) {
                canPlaceHorizontally = false;
                break;
              }
              if (overrides[r][current] === 2) {
                multiplier += multiplier;
              }
              if (r === x && current === y) {
                includesDropPoint = true;
              }
            }

            if (canPlaceHorizontally && includesDropPoint) {
              for (let current = c; current < end; current++) {
                counts[r][current] += 1 * multiplier;
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let end = r + boat;
            let canPlaceVertically = true;
            let includesDropPoint = false;
            let multiplier = 1;

            for (let current = r; current < end; current++) {
              if (current >= rows || overrides[current][c] === 1) {
                canPlaceVertically = false;
                break;
              }
              if (overrides[current][c] === 2) {
                multiplier += multiplier;
              }
              if (current === x && c === y) {
                includesDropPoint = true;
              }
            }

            if (canPlaceVertically && includesDropPoint) {
              for (let current = r; current < end; current++) {
                counts[current][c] += 1 * multiplier;
              }
            }
          }
        }
      });
    }
  }

  // Optional: apply separation constraint more strictly by discounting adjacent placements.
  // For brevity, we keep the heuristic. Enhancement hooks can be added here.

  window.sonarRules = {
    generateHeatmap,
  };
})();
