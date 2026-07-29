/* Architecture diagram rendering (SVG) */

const Render = {
  /* Draw a mini architecture diagram for a flash card */
  diagram(card, containerId, highlightOption) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const n = card.nodes.length;
    const svgW = el.clientWidth || 400;
    const svgH = 180;
    const bx = 80, by = 24;
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);
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

    const topicColor = {
      caching: "#e3f2fd",
      queues: "#fce4ec",
      databases: "#e8f5e9",
      consensus: "#fff3e0",
      "api-design": "#f3e5f5",
      loadbalancing: "#e0f7fa",
      storage: "#fff8e1",
      observability: "#f1f8e9",
      security: "#fbe9e7",
      "real-time": "#e0f2f1"
    };

    let html = `<svg width="${svgW}" height="${svgH}" style="max-width:100%;display:block;">`;
    html += `<rect width="${svgW}" height="${svgH}" fill="#fafafa" rx="6"/>`;

    // draw connections between consecutive nodes
    for (let i = 0; i < n - 1; i++) {
      const from = positions[i];
      const to = positions[i + 1];
      html += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#bbb" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    }

    // draw each node as a box
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const bg = topicColor[card.topic] || "#eee";
      html += `<rect x="${p.x - bx / 2}" y="${p.y - by / 2}" width="${bx}" height="${by}" rx="4" fill="${bg}" stroke="#90a4ae" stroke-width="1.5"/>`;
      html += `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="10" fill="#333" font-family="sans-serif">${card.nodes[i]}</text>`;
    }

    // highlight the winning path if provided
    if (highlightOption) {
      for (let i = 0; i < n - 1; i++) {
        html += `<line x1="${positions[i].x}" y1="${positions[i].y - by / 2}" x2="${positions[i+1].x}" y2="${positions[i+1].y - by / 2}" stroke="#43a047" stroke-width="3" stroke-dasharray="6,2" opacity="0.7"/>`;
      }
    }

    html += '</svg>';
    el.innerHTML = html;
  }
};
