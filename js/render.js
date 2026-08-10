/* Architecture diagram rendering (SVG) with directional flows.
   Cards carry a flow graph (card.flows) plus per-option wiring (option.flows);
   legacy cards without flows render as a linear chain. Nodes are placed in
   layers by longest-path ranking (Sugiyama-lite), edges are cubic beziers with
   tangent arrowheads and verb pills, and all colors come from the theme's CSS
   variables so light, dark, and high-contrast themes all work. */

const Render = {
  topicColor: {
    caching: {bg: "#e3f2fd", stroke: "#1565c0"},
    queues: {bg: "#fce4ec", stroke: "#c62828"},
    databases: {bg: "#e8f5e9", stroke: "#2e7d32"},
    consensus: {bg: "#fff3e0", stroke: "#e65100"},
    "api-design": {bg: "#f3e5f5", stroke: "#6a1b9a"},
    loadbalancing: {bg: "#e0f7fa", stroke: "#00695c"},
    storage: {bg: "#fff8e1", stroke: "#f57f17"},
    observability: {bg: "#f1f8e9", stroke: "#558b2f"},
    security: {bg: "#fbe9e7", stroke: "#bf360c"},
    "real-time": {bg: "#e0f2f1", stroke: "#004d40"}
  },

  FONT_CHAR_W: 5.4,

  /* Wrap a node label into at most two lines of the given width. */
  _wrap(label, maxChars) {
    const words = String(label).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      if (line && (line + ' ' + word).length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
      if (lines.length === 2) break;
    }
    if (lines.length < 2 && line) lines.push(line);
    return lines.length ? lines : [String(label)];
  },

  _boxSize(label, maxChars) {
    const lines = this._wrap(label, maxChars);
    const maxLen = Math.max(...lines.map(line => line.length), 1);
    return {
      w: Math.max(64, Math.min(170, 14 + maxLen * this.FONT_CHAR_W)),
      h: lines.length > 1 ? 40 : 30,
      lines
    };
  },

  /* Pure layout over a normalized flow graph.
     Returns { width, height, nodes: [{name, x, y, w, h, lines}],
     edges: [{from, to, verb, kind, x1, y1, x2, y2, c1x, c1y, c2x, c2y}] }. */
  layout(flows, nodes) {
    const names = Array.isArray(nodes) ? nodes : [];
    const index = new Map(names.map((name, i) => [name, i]));
    const valid = (Array.isArray(flows) ? flows : [])
      .filter(edge => edge && index.has(edge.from) && index.has(edge.to) && edge.from !== edge.to);

    // Layering: place nodes level by level; a node is ready once every
    // incoming edge comes from an already-placed node (longest-path order).
    // The end-user node (when present) is always anchored in the first layer,
    // so diagrams read from the person using the system. If a cycle stalls
    // progress, drop a callback-kind edge first (then any edge) internal to
    // the remainder — the dropped edge still renders as a backward curve, but
    // layout always terminates and stays readable.
    const END_USER_NODE = /^(end[- ]?user|user|web client|mobile app|browser|client|customer|app)$/i;
    const isEndUser = i => END_USER_NODE.test(String(names[i] || ''));
    const edges = [...valid];
    const dropped = new Set();
    const layer = new Array(names.length).fill(null);
    const placed = new Set();
    let depth = 0;
    while (placed.size < names.length) {
      const remaining = names.map((_, i) => i).filter(i => !placed.has(i));
      const frontier = remaining.filter(i =>
        edges.every((edge, ei) =>
          dropped.has(ei) || index.get(edge.to) !== i || placed.has(index.get(edge.from)) || isEndUser(i)
        )
      );
      if (!frontier.length) {
        const internal = (kind) => edges.findIndex((edge, ei) =>
          !dropped.has(ei) && (!kind || edge.kind === kind) &&
          remaining.includes(index.get(edge.from)) && remaining.includes(index.get(edge.to))
        );
        const target = internal('callback');
        dropped.add(target !== -1 ? target : internal(null));
        continue;
      }
      for (const i of frontier) {
        layer[i] = depth;
        placed.add(i);
      }
      depth++;
    }
    for (let i = 0; i < names.length; i++) {
      if (layer[i] === null) layer[i] = depth;
    }

    const layers = Array.from({ length: Math.max(...layer) + 1 }, () => []);
    for (let i = 0; i < names.length; i++) {
      layers[layer[i]].push(i);
    }

    const marginX = 16, gapX = 44, marginY = 14, gapY = 38;
    const sized = names.map(name => this._boxSize(name, 16));
    const colW = layers.map(col => col.length ? Math.max(...col.map(i => sized[i].w)) : 0);
    const rowH = layers.map(col => col.length ? Math.max(...col.map(i => sized[i].h)) : 0);

    const positions = new Array(names.length);
    let x = marginX;
    for (let c = 0; c < layers.length; c++) {
      let y = marginY;
      for (const i of layers[c]) {
        positions[i] = {
          x: x + (colW[c] - sized[i].w) / 2,
          y: y + (rowH[c] - sized[i].h) / 2,
          ...sized[i]
        };
        y += rowH[c] + gapY;
      }
      x += colW[c] + gapX;
    }
    const width = Math.max(260, x - gapX + marginX);
    const columnHeights = layers.map(col => col.length
      ? col.reduce((sum, i) => sum + sized[i].h, 0) + gapY * (col.length - 1)
      : 0);
    const height = Math.max(58, marginY * 2 + Math.max(...columnHeights));

    const edgeList = valid.map(edge => {
      const f = positions[index.get(edge.from)];
      const t = positions[index.get(edge.to)];
      const sameCol = f.x === t.x;
      const dx = (t.x + t.w / 2) - (f.x + f.w / 2);
      const x1 = f.x + f.w / 2, y1 = f.y + f.h / 2;
      const x2 = t.x + t.w / 2, y2 = t.y + t.h / 2;
      const bend = Math.min(70, Math.max(24, Math.abs(dx) * 0.4));
      let c1x, c1y, c2x, c2y;
      if (sameCol) {
        const dir = y2 >= y1 ? 1 : -1;
        c1x = x1 + (dir > 0 ? -1 : 1) * bend;
        c1y = y1 + dir * bend;
        c2x = x2 + (dir > 0 ? -1 : 1) * bend;
        c2y = y2 - dir * bend;
      } else {
        const dir = dx >= 0 ? 1 : -1;
        c1x = x1 + dir * bend;
        c1y = y1;
        c2x = x2 - dir * bend;
        c2y = y2;
      }
      return { ...edge, x1, y1, x2, y2, c1x, c1y, c2x, c2y };
    });

    return { width, height, nodes: positions, edges: edgeList };
  },

  _bezierPoint(p0, c1, c2, p1, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
    };
  },

  _edgeKey(edge) { return edge.from + '\u0000' + edge.to; },

  diagram(card, containerId, opts = {}) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (typeof opts !== 'object') opts = { reveal: !!opts };
    const reveal = !!opts.reveal;
    const chosenOption = opts.option;
    const correctOption = (card?.options || []).find(option => option?.id === card.correct);

    // Which wiring to draw: the chosen option's, else the correct option's,
    // else the card's own flows (or the chain fallback).
    let drawn = (chosenOption?.flows && chosenOption.flows.length ? chosenOption.flows : null)
      || (correctOption?.flows && correctOption.flows.length ? correctOption.flows : null)
      || card?.flows || [];
    const layout = this.layout(drawn, card?.nodes || []);

    const correctKeys = new Set((correctOption?.flows || []).map(this._edgeKey));
    const chosenKeys = new Set((chosenOption?.flows || []).map(this._edgeKey));
    const revealHighlight = reveal && chosenOption && chosenOption.flows && chosenOption.flows.length;

    const tc = this.topicColor[card?.topic] || { bg: '#eee', stroke: '#999' };
    const edgeColor = revealHighlight ? 'var(--success)' : (reveal ? 'var(--success)' : 'var(--muted)');
    const edgeDash = reveal ? (revealHighlight ? '' : '6,3') : '3,4';
    const edgeOpacity = reveal ? 0.9 : 0.55;

    // nodes actually touched by the drawn wiring (untouched nodes render faded)
    const touched = new Set();
    for (const edge of layout.edges) {
      touched.add(edge.from);
      touched.add(edge.to);
    }

    let html = `<svg viewBox="0 0 ${layout.width} ${layout.height}" style="width:100%;height:auto;display:block;font-family:sans-serif;">`;

    for (const edge of layout.edges) {
      const inCorrect = correctKeys.has(this._edgeKey(edge));
      const inChosen = chosenKeys.has(this._edgeKey(edge));
      let color = edgeColor;
      let dash = edgeDash;
      if (revealHighlight) {
        if (inCorrect) { color = 'var(--success)'; dash = ''; }
        else { color = 'var(--danger)'; dash = '5,3'; }
      }
      if (edge.kind === 'callback') dash = dash ? `2,3 ${dash}` : '2,3';
      const path = `M${edge.x1},${edge.y1} C${edge.c1x},${edge.c1y} ${edge.c2x},${edge.c2y} ${edge.x2},${edge.y2}`;
      html += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}" opacity="${edgeOpacity}"/>`;

      // arrowhead on the true end tangent
      const angle = Math.atan2(edge.y2 - edge.c2y, edge.x2 - edge.c2x);
      const a = 8;
      html += `<polygon points="${edge.x2},${edge.y2} ${edge.x2 - a * Math.cos(angle - 0.42)},${edge.y2 - a * Math.sin(angle - 0.42)} ${edge.x2 - a * Math.cos(angle + 0.42)},${edge.y2 - a * Math.sin(angle + 0.42)}" fill="${color}" opacity="${edgeOpacity}"/>`;

      // verb pill at the bezier midpoint
      if (edge.verb) {
        const mid = this._bezierPoint(
          { x: edge.x1, y: edge.y1 },
          { x: edge.c1x, y: edge.c1y },
          { x: edge.c2x, y: edge.c2y },
          { x: edge.x2, y: edge.y2 },
          0.5
        );
        const pw = edge.verb.length * 4.6 + 12;
        const ph = 14;
        html += `<rect x="${mid.x - pw / 2}" y="${mid.y - ph / 2}" width="${pw}" height="${ph}" rx="7" fill="var(--diagram-bg)" stroke="${color}" stroke-width="1" opacity="0.95"/>`;
        html += `<text x="${mid.x}" y="${mid.y + 3}" text-anchor="middle" font-size="8" fill="var(--muted-text)" font-family="sans-serif">${edge.verb}</text>`;
      }
    }

    layout.nodes.forEach((pos, i) => {
      const name = card.nodes[i];
      const active = touched.has(name);
      const opacity = active ? 1 : 0.4;
      const fill = reveal && active ? 'var(--card-bg)' : 'var(--card-bg)';
      html += `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="8" fill="${fill}" stroke="${tc.stroke}" stroke-width="${active ? 2 : 1}" stroke-dasharray="${active ? '' : '3,3'}" opacity="${opacity}"/>`;
      pos.lines.forEach((line, li) => {
        const lineY = pos.y + (pos.lines.length > 1 ? pos.h / 2 - 2 + li * 13 : pos.h / 2 + 4);
        html += `<text x="${pos.x + pos.w / 2}" y="${lineY}" text-anchor="middle" font-size="9.5" fill="var(--fg)" font-weight="600" opacity="${opacity}" font-family="sans-serif">${line}</text>`;
      });
    });

    html += '</svg>';
    el.innerHTML = html;
  }
};
