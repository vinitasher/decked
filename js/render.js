/* Architecture diagram rendering (Mermaid) with directional flows.
   Cards carry a flow graph (card.flows) plus per-option wiring (option.flows);
   legacy cards without flows render as a linear chain. Mermaid owns graph
   layout and theme-aware rendering for every diagram view. */

const Render = {
  _flowLabel(edge) {
    const label = typeof edge?.verb === 'string' ? edge.verb.trim() : '';
    if (label) return label;
    return { sync: 'sends', async: 'publishes', callback: 'returns' }[edge?.kind] || 'connects';
  },

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
      w: Math.max(64, Math.min(170, 14 + maxLen * 5.4)),
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
    const labeled = valid.map(edge => ({ ...edge, verb: this._flowLabel(edge) }));

    // Layering: place nodes level by level; a node is ready once every
    // incoming edge comes from an already-placed node (longest-path order).
    // The end-user node (when present) is always anchored in the first layer,
    // so diagrams read from the person using the system. If a cycle stalls
    // progress, drop a callback-kind edge first (then any edge) internal to
    // the remainder — the dropped edge still renders as a backward curve, but
    // layout always terminates and stays readable.
    const END_USER_NODE = /^(end[- ]?user|user|web client|mobile app|browser|client|customer|app)$/i;
    const isEndUser = i => END_USER_NODE.test(String(names[i] || ''));
    const edges = [...labeled];
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

    // Vertical layout: layers are rows stacked top → bottom (the end user sits
    // in the top row), with the layer's nodes side by side within the row.
    const marginX = 16, gapX = 40, marginY = 14, gapY = 34;
    const sized = names.map(name => this._boxSize(name, 16));
    const colW = layers.map(row => row.length ? Math.max(...row.map(i => sized[i].w)) : 0);
    const rowH = layers.map(row => row.length ? Math.max(...row.map(i => sized[i].h)) : 0);

    const positions = new Array(names.length);
    let y = marginY;
    for (let r = 0; r < layers.length; r++) {
      let x = marginX;
      for (const i of layers[r]) {
        positions[i] = {
          x: x + (colW[r] - sized[i].w) / 2,
          y: y + (rowH[r] - sized[i].h) / 2,
          ...sized[i]
        };
        x += colW[r] + gapX;
      }
      y += rowH[r] + gapY;
    }
    const rowWidths = layers.map(row => row.length
      ? row.length * colW[layers.indexOf(row)] + gapX * (row.length - 1)
      : 0);
    const width = Math.max(260, marginX * 2 + Math.max(...rowWidths));
    const height = Math.max(120, marginY * 2
      + layers.reduce((sum, row) => sum + rowH[layers.indexOf(row)], 0)
      + gapY * (layers.length - 1));

    const edgeList = valid.map(edge => {
      const f = positions[index.get(edge.from)];
      const t = positions[index.get(edge.to)];
      const sameRow = f.y === t.y;
      const dy = (t.y + t.h / 2) - (f.y + f.h / 2);
      const x1 = f.x + f.w / 2, y1 = f.y + f.h / 2;
      const x2 = t.x + t.w / 2, y2 = t.y + t.h / 2;
      const bend = Math.min(70, Math.max(24, Math.abs(dy) * 0.4));
      let c1x, c1y, c2x, c2y;
      if (sameRow) {
        const dir = x2 >= x1 ? 1 : -1;
        c1x = x1 + dir * bend;
        c1y = y1 + (dir > 0 ? -1 : 1) * bend;
        c2x = x2 - dir * bend;
        c2y = y2 + (dir > 0 ? -1 : 1) * bend;
      } else {
        const dir = dy >= 0 ? 1 : -1;
        c1x = x1;
        c1y = y1 + dir * bend;
        c2x = x2;
        c2y = y2 - dir * bend;
      }
      return { ...edge, x1, y1, x2, y2, c1x, c1y, c2x, c2y };
    });

    return { width, height, nodes: positions, edges: edgeList };
  },

  _edgeKey(edge) { return edge.from + '\u0000' + edge.to; },

  _compareEdgeKey(edge) {
    return this._edgeKey(edge) + '\u0000' + (edge.kind || '') + '\u0000' + (edge.verb || '');
  },

  _validDiagramFlows(flows, nodes) {
    const nodeSet = new Set(Array.isArray(nodes) ? nodes : []);
    return (Array.isArray(flows) ? flows : [])
      .filter(flow => flow && typeof flow === 'object'
        && typeof flow.from === 'string' && typeof flow.to === 'string'
        && flow.from && flow.to && flow.from !== flow.to
        && nodeSet.has(flow.from) && nodeSet.has(flow.to))
      .map(flow => ({ ...flow }));
  },

  /* A valid card normally has base flows. Keep legacy and partially generated
     cards renderable by synthesizing the same linear fallback used by the
     card normalizer when no valid base flow survives validation. */
  _baseDiagramFlows(card) {
    const valid = this._validDiagramFlows(card?.flows, card?.nodes);
    if (valid.length) return valid;
    const nodes = Array.isArray(card?.nodes) ? card.nodes : [];
    return nodes.slice(0, -1).map((from, index) => ({
      from,
      to: nodes[index + 1],
      verb: 'sends',
      kind: 'sync'
    }));
  },

  /* Per-option wiring colors for the compare view. */
  OPTION_COLORS: { A: '#1976d2', B: '#2e7d32', C: '#e65100', D: '#7b1fa2' },

  /* Entry point: Mermaid is the only diagram renderer. */
  diagram(card, containerId, opts = {}) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (typeof opts !== 'object') opts = { reveal: !!opts };
    if (typeof window !== 'undefined' && window.mermaid && typeof window.mermaid.render === 'function') {
      this._renderMermaid(card, el, opts).catch(() => this._showDiagramError(el));
    } else {
      this._showDiagramError(el);
    }
  },

  _esc(label) { return String(label ?? '').replace(/"/g, '&quot;'); },

  _showDiagramError(el, message = 'Diagram unavailable. Please reload and try again.') {
    el.innerHTML = `<p class="diagram-error" role="status">${this._esc(message)}</p>`;
  },

  /* Edge labels live inside Mermaid pipe syntax, which rejects parentheses
     and other parser delimiters — strip syntax-significant punctuation
     (verbs like "loads on miss (per second)" stay readable) and collapse
     whitespace. */
  _safeMermaidLabel(text) {
    return this._esc(String(text ?? '')
      .replace(/[\r\n]/g, ' ')
      .replace(/[()[\]{}|;"'`<>\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
  },

  /* Pure mapping of card flows onto a Mermaid flowchart definition plus
     per-edge linkStyle overrides and the compare legend. */
  _mermaidDefinition(card, opts = {}) {
    const reveal = !!opts.reveal;
    const compare = !!opts.compare;
    const chosenOption = opts.option;
    const correctOption = (card?.options || []).find(option => option?.id === card.correct);
    const baseEdges = this._baseDiagramFlows(card);
    const correctOptionEdges = this._validDiagramFlows(correctOption?.flows, card?.nodes);
    const chosenOptionEdges = this._validDiagramFlows(chosenOption?.flows, card?.nodes);
    const optionWiring = new Map();

    let edges;
    if (compare) {
      if (!correctOptionEdges.length) {
        return {
          definition: '',
          linkStyles: [],
          legendHtml: '',
          error: 'Correct option wiring is unavailable.'
        };
      }
      const byKey = new Map();
      for (const option of card?.options || []) {
        const explicitEdges = this._validDiagramFlows(option?.flows, card?.nodes);
        const optionEdges = explicitEdges.length ? explicitEdges : correctOptionEdges;
        optionWiring.set(option.id, {
          hasExplicitWiring: explicitEdges.length > 0,
          inheritsCorrectWiring: explicitEdges.length === 0
        });
        for (const flow of optionEdges) {
          const key = this._compareEdgeKey(flow);
          let group = byKey.get(key);
          if (!group) {
            group = { ...flow, options: [] };
            byKey.set(key, group);
          }
          group.options.push(option.id);
        }
      }
      edges = [...byKey.values()];
    } else {
      edges = chosenOptionEdges.length ? chosenOptionEdges
        : correctOptionEdges.length ? correctOptionEdges
          : baseEdges;
      edges = edges.map(flow => ({ ...flow, options: [] }));
    }

    const def = ['flowchart TB'];
    (card?.nodes || []).forEach((name, i) => {
      def.push(`n${i}["${this._esc(name)}"]`);
    });

    const correctKeys = new Set(correctOptionEdges.map(this._edgeKey));
    const chosenKeys = new Set(chosenOptionEdges.map(this._edgeKey));
    const revealHighlight = reveal && chosenOption && chosenOptionEdges.length;
    const nodeIds = new Map((card?.nodes || []).map((name, i) => [name, `n${i}`]));

    const linkStyles = [];
    let linkIndex = 0;
    for (const edge of edges) {
      const from = nodeIds.get(edge.from);
      const to = nodeIds.get(edge.to);
      if (from === undefined || to === undefined || from === to) continue;
      const dotted = edge.kind === 'async' || edge.kind === 'callback';
      let label = this._flowLabel(edge);
      if (compare && edge.options && edge.options.length) {
        // Mermaid pipe labels reject parentheses; use a middle dot instead
        label = label ? `${label} · ${edge.options.join(',')}` : `${edge.options.join(',')}`;
      }
      def.push(`${from} ${dotted ? '-.->' : '-->'}|${this._safeMermaidLabel(label)}| ${to}`);
      let style = null;
      if (compare) {
        const first = edge.options?.[0];
        const isCorrectEdge = edge.options && edge.options.includes(card.correct);
        style = `stroke:${this.OPTION_COLORS[first] || '#888'},stroke-width:${isCorrectEdge ? 3 : 2}px`;
      } else if (revealHighlight) {
        const inCorrect = correctKeys.has(this._edgeKey(edge));
        const inChosen = chosenKeys.has(this._edgeKey(edge));
        if (inCorrect) style = 'stroke:#43a047,stroke-width:3px';
        else if (inChosen) style = 'stroke:#e53935,stroke-width:3px,stroke-dasharray:6 4';
      } else if (reveal) {
        style = 'stroke:#43a047,stroke-width:2.5px';
      } else {
        style = 'stroke:#90a4ae,stroke-width:1.8px,stroke-dasharray:5 4';
      }
      linkStyles.push(`linkStyle ${linkIndex} ${style}`);
      linkIndex++;
    }
    def.push(...linkStyles);

    let legendHtml = '';
    if (compare) {
      legendHtml = '<div class="diagram-legend" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center;margin-top:8px;font-size:0.72rem;color:var(--muted-text);">';
      for (const option of card?.options || []) {
        const wiring = optionWiring.get(option.id);
        const hasWiring = wiring?.hasExplicitWiring || false;
        const inheritsCorrectWiring = wiring?.inheritsCorrectWiring || false;
        const color = this.OPTION_COLORS[option.id] || '#888';
        const isCorrect = option.id === card.correct;
        const title = hasWiring ? '' : inheritsCorrectWiring
          ? 'inherits correct option wiring'
          : 'no wiring data';
        legendHtml += `<span style="opacity:${hasWiring || inheritsCorrectWiring ? 1 : 0.45};" title="${title}"><span style="display:inline-block;width:12px;height:4px;border-radius:2px;background:${color};margin-right:5px;vertical-align:middle;"></span>${option.id}${isCorrect ? ' ✓' : ''}</span>`;
      }
      legendHtml += '</div>';
    }

    return { definition: def.join('\n'), linkStyles, legendHtml };
  },

  async _renderMermaid(card, el, opts) {
    const { definition, legendHtml, error } = this._mermaidDefinition(card, opts);
    if (error) {
      this._showDiagramError(el, error);
      return;
    }
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral';
    if (typeof window.mermaid.initialize === 'function') {
      window.mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
    }
    const id = 'mermaid-' + Math.random().toString(36).slice(2, 8);
    const { svg } = await window.mermaid.render(id, definition);
    el.innerHTML = svg + (legendHtml || '');
  },

};
