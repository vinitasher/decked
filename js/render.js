/* Architecture diagram rendering (SVG) with directional flows */

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

  diagram(card, containerId, reveal) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const n = card.nodes.length;
    const svgW = el.clientWidth || 400;
    const svgH = 200;
    const cols = Math.min(n, 5);
    const rows = Math.ceil(n / cols);
    const bx = 90, by = 32;
    const gapX = (svgW - cols * bx) / (cols + 1);
    const gapY = (svgH - rows * by) / (rows + 1);

    let positions = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gapX + col * (bx + gapX) + bx / 2;
      const cy = gapY + row * (by + gapY) + by / 2;
      positions.push({ x: cx, y: cy });
    }

    const tc = this.topicColor[card.topic] || {bg: "#eee", stroke: "#999"};
    const edgeColor = reveal ? "#43a047" : "#90a4ae";
    const edgeOpacity = reveal ? "0.85" : "0.4";

    let html = `<svg width="${svgW}" height="${svgH}" style="max-width:100%;display:block;">`;
    html += `<rect width="${svgW}" height="${svgH}" fill="#f8f9fa" rx="8"/>`;

    // draw directed edges between consecutive nodes
    for (let i = 0; i < n - 1; i++) {
      const f = positions[i];
      const t = positions[i + 1];
      const dx = t.x - f.x, dy = t.y - f.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len, uy = dy / len;
      const sx = f.x + ux * (bx / 2 + 4);
      const sy = f.y + uy * (by / 2 + 4);
      const ex = t.x - ux * (bx / 2 + 4);
      const ey = t.y - uy * (by / 2 + 4);

      // curved arrow
      const midX = (sx + ex) / 2, midY = (sy + ey) / 2 - 10;
      html += `<path d="M${sx},${sy} Q${midX},${midY} ${ex},${ey}" fill="none" stroke="${edgeColor}" stroke-width="2" stroke-dasharray="${reveal ? '6,2' : '3,3'}" opacity="${edgeOpacity}"/>`;

      // arrowhead
      const angle = Math.atan2(ey - midY, ex - midX);
      const aSize = 7;
      html += `<polygon points="${ex},${ey} ${ex - aSize*Math.cos(angle - 0.4)},${ey - aSize*Math.sin(angle - 0.4)} ${ex - aSize*Math.cos(angle + 0.4)},${ey - aSize*Math.sin(angle + 0.4)}" fill="${edgeColor}" opacity="${edgeOpacity}"/>`;

      // edge label
      const edgeLabels = ["", "reads", "writes", "queries", "pushes", "forwards", "routes", "calls", "fetches", "publishes", "sends", "responds"];
      if (i < edgeLabels.length) {
        html += `<text x="${midX}" y="${midY - 2}" text-anchor="middle" font-size="8" fill="#888" font-family="sans-serif">${edgeLabels[i]}</text>`;
      }
    }

    // conditional path highlight for correctness
    if (reveal) {
      for (let i = 0; i < n - 1; i++) {
        const f = positions[i];
        const t = positions[i + 1];
        const dx = t.x - f.x, dy = t.y - f.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len, uy = dy / len;
        const sx = f.x + ux * (bx / 2 + 12);
        const sy = f.y + uy * (by / 2 + 12);
        const ex = t.x - ux * (bx / 2 + 12);
        const ey = t.y - uy * (by / 2 + 12);
        html += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#43a047" stroke-width="3" stroke-dasharray="6,2" opacity="0.3"/>`;
      }
    }

    // draw nodes
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const fill = i === 0 ? "#e3f2fd" : (i === n - 1 ? "#fff3e0" : tc.bg);
      const stroke = i === 0 ? "#1565c0" : (i === n - 1 ? "#e65100" : tc.stroke);
      html += `<rect x="${p.x - bx / 2}" y="${p.y - by / 2}" width="${bx}" height="${by}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${reveal ? 2 : 1.5}"/>`;
      const label = card.nodes[i];
      // split long names
      if (label.length > 14) {
        const mid = Math.ceil(label.length / 2);
        html += `<text x="${p.x}" y="${p.y - 4}" text-anchor="middle" font-size="9" fill="#333" font-family="sans-serif">${label.substring(0, mid)}</text>`;
        html += `<text x="${p.x}" y="${p.y + 10}" text-anchor="middle" font-size="9" fill="#333" font-family="sans-serif">${label.substring(mid)}</text>`;
      } else {
        html += `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="10" fill="#333" font-weight="${reveal ? '600' : '400'}" font-family="sans-serif">${label}</text>`;
      }
    }

    html += '</svg>';
    el.innerHTML = html;
  }
};
