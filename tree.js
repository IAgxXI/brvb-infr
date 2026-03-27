/* ── Configuration ───────────────────────────────────────────────── */
const BOX_W   = 200;   // node box width in px 178
const LINE_H  = 18;    // height per text line in px
const V_PAD   = 6;     // top/bottom padding inside box
const H_GAP   = 240;   // horizontal gap between depth levels
const FONT_PX = 14;    // label font size in px
const V_GAP   = 1;     // vertical gap between sibling boxes in px

/* ── Text measurement & word-wrap ───────────────────────────────── */
const _ctx = document.createElement('canvas').getContext('2d');
_ctx.font   = `${FONT_PX}px Segoe UI, Arial, sans-serif`;
const tw    = s => _ctx.measureText(s).width;

function wrapWords(text, maxW) {
  if (tw(text) <= maxW) return [text];
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (tw(t) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function getLines(name) {
  return name
    .split(/\\n|\n/)
    .flatMap(seg => wrapWords(seg.trim(), BOX_W - 16))
    .filter(Boolean);
}

function boxH(d) {
  return getLines(d.data.name).length * LINE_H + V_PAD * 2;
}

/* Color palette per depth level — all siblings share the same color */
const DEPTH_COLORS = [
  { fill: '#2c6e40', stroke: '#1a4427' }, // depth 0 – root green
  { fill: '#4a2c6e', stroke: '#2e1a45' }, // depth 1 – purple
  { fill: '#7a6e2a', stroke: '#4e4818' }, // depth 2 – gold
  { fill: '#5a5a8a', stroke: '#3a3a60' }, // depth 3 – slate blue
  { fill: '#8a3a3a', stroke: '#5a2020' }, // depth 4 – dark red
];
function levelColor(d) {
  return DEPTH_COLORS[Math.min(d.depth, DEPTH_COLORS.length - 1)];
}

/* ── JSON location offsets ───────────────────────────────────────────
 *  "offsetY": 40   →  shift node (and all descendants) 40 px down
 *  "offsetY": -40  →  shift node (and all descendants) 40 px up
 *  "offsetX": 60   →  shift node (and all descendants) 60 px right (further from root)
 *  "offsetX": -60  →  shift node (and all descendants) 60 px left  (closer to root)
 *  Both can be combined on the same node.
 * ─────────────────────────────────────────────────────────────────── */
function applyLocationOffsets(node, accY, accX) {
  accY = (accY || 0) + (node.data.offsetY || 0);
  accX = (accX || 0) + (node.data.offsetX || 0);
  node.x += accY;   // d3 tree: x is vertical axis
  node.y += accX;   // d3 tree: y is horizontal axis
  if (node.children) node.children.forEach(c => applyLocationOffsets(c, accY, accX));
}

/* ── Assign unique stable IDs to raw JSON data (once) ───────────── */
let _uid = 0;
function assignIds(obj) {
  obj._id = _uid++;
  if (Array.isArray(obj.children)) obj.children.forEach(assignIds);
}

/* ── Per-node drag offsets keyed by _id ─────────────────────────── */
const offsets = {};
const off    = id => offsets[id] || (offsets[id] = { dx: 0, dy: 0 });
const clrOff = ()  => { for (const k in offsets) delete offsets[k]; };

/* ── Screen coordinate helpers ───────────────────────────────────── */
// d3 tree: d.x = vertical position, d.y = horizontal (depth) position
const nx  = d => d.y + off(d.data._id).dx;           // left edge X
const ny  = d => d.x + off(d.data._id).dy;           // centre Y
const ntl = d => `translate(${nx(d)},${ny(d) - boxH(d) / 2})`; // top-left corner

/* ── Right-angle elbow connector ─────────────────────────────────── */
function elbow(link) {
  const sx = nx(link.source) + BOX_W, sy = ny(link.source);
  const tx = nx(link.target),         ty = ny(link.target);
  const mx = (sx + tx) / 2;
  return `M${sx},${sy} H${mx} V${ty} H${tx}`;
}

/* ── Main ────────────────────────────────────────────────────────── */
async function main() {
  /* Detect URL parameter: if present, enable scroll wheel zoom */
  const urlParams = new URLSearchParams(window.location.search);
  const scrollZoomEnabled = urlParams.has('zoom') || urlParams.has('scroll');
  const zoomHint = document.getElementById('zoomHint');
  if (zoomHint && scrollZoomEnabled) {
    zoomHint.textContent = ' &nbsp;|&nbsp; Scroll — zoom';
  }

  /* Load data */
  let raw;
  try {
    const res = await fetch('./flare.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (e) {
    document.body.innerHTML =
      `<p style="padding:2em;font-family:sans-serif;color:#c00">
        Unable to load <b>flare.json</b> — serve this page from a web server.<br>
        <small>${e.message}</small>
      </p>`;
    return;
  }
  assignIds(raw);

  /* SVG setup */
  const svg    = d3.select('#chart');
  const g      = svg.append('g');
  const lLayer = g.append('g'); // links drawn below nodes
  const nLayer = g.append('g'); // nodes

  /* Zoom / pan (scroll enabled only if ?zoom or ?scroll in URL) */
  const zoom = d3.zoom()
    .scaleExtent([0.04, 4])
    .filter(e => scrollZoomEnabled || e.type !== 'wheel')  // allow wheel zoom if param set
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  let savedTransform = null;
  let savedViewBox = null;
  let savedPreserveAspectRatio = null;
  let printPrepared = false;

  function preparePrintLayout() {
    if (printPrepared) return;
    printPrepared = true;

    savedTransform = d3.zoomTransform(svg.node());
    savedViewBox = svg.attr('viewBox');
    savedPreserveAspectRatio = svg.attr('preserveAspectRatio');

    // Print should include the entire diagram, independent of current pan/zoom state.
    svg.call(zoom.transform, d3.zoomIdentity);

    const b = g.node().getBBox();
    if (!b.width || !b.height) return;
    const pad = 24;
    const vb = [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2].join(' ');
    svg.attr('viewBox', vb).attr('preserveAspectRatio', 'xMidYMin meet');
  }

  function restoreAfterPrint() {
    if (!printPrepared) return;

    if (savedViewBox) svg.attr('viewBox', savedViewBox);
    else svg.attr('viewBox', null);

    if (savedPreserveAspectRatio) svg.attr('preserveAspectRatio', savedPreserveAspectRatio);
    else svg.attr('preserveAspectRatio', null);

    if (savedTransform) svg.call(zoom.transform, savedTransform);
    printPrepared = false;
  }

  window.addEventListener('beforeprint', preparePrintLayout);
  window.addEventListener('afterprint', restoreAfterPrint);
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    const onPrintMediaChange = e => {
      if (e.matches) preparePrintLayout();
      else restoreAfterPrint();
    };
    if (mq.addEventListener) mq.addEventListener('change', onPrintMediaChange);
    else if (mq.addListener) mq.addListener(onPrintMediaChange);
  }

  function fitView() {
    const W = window.innerWidth, H = window.innerHeight;
    const b = g.node().getBBox();
    if (!b.width) return;
    const sc = Math.min(1.5, (W - 40) / b.width, (H - 40) / b.height);
    const tx = W / 2 - (b.x + b.width  / 2) * sc;
    const ty = H / 2 - (b.y + b.height / 2) * sc;
    svg.transition().duration(350)
       .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
  }

  /* Node drag – moves one node independently */
  const drag = d3.drag()
    .on('start', function(event) {
      d3.select(this).raise();
      event.sourceEvent.stopPropagation();
    })
    .on('drag', function(event, d) {
      const o = off(d.data._id);
      o.dx += event.dx;
      o.dy += event.dy;
      d3.select(this).attr('transform', ntl(d));
      lLayer.selectAll('.link').attr('d', elbow);
    });

  /* Build / rebuild the tree layout */
  function render() {
    const root = d3.hierarchy(raw);

    /* Adaptive vertical size: tallest leaf box + V_GAP per leaf, no artificial minimum */
    const maxLeafH = Math.max(...root.leaves().map(l => boxH(l)));
    const treeH = root.leaves().length * (maxLeafH + V_GAP);

    d3.tree()
      .size([treeH, 100])
      .separation((a, b) => a.parent === b.parent ? 1 : 1.5)(root);

    /* Pin each depth level to a fixed horizontal position */
    root.descendants().forEach(d => { d.y = d.depth * H_GAP; });

    /* Apply any JSON-defined location offsets to subtrees */
    applyLocationOffsets(root, 0, 0);

    /* ── Links ── */
    lLayer.selectAll('.link')
      .data(root.links(), d => d.target.data._id)
      .join('path')
      .attr('class', 'link')
      .attr('d', elbow);

    /* ── Nodes ── */
    const nodeG = nLayer.selectAll('.node')
      .data(root.descendants(), d => d.data._id)
      .join(enter => {
        const g = enter.append('g')
          .attr('class', 'node')
          .attr('id', d => 'nd' + d.data._id);
        g.append('rect').attr('rx', 4);
        g.append('g').attr('class', 'tg');
        return g;
      })
      .attr('transform', ntl)
      .call(drag);

    /* Update each node's rectangle and text labels */
    nodeG.each(function(d) {
      const s   = d3.select(this);
      const h   = boxH(d);
      const col = levelColor(d);
      const lns = getLines(d.data.name);

      s.select('rect')
        .attr('width',        BOX_W)
        .attr('height',       h)
        .attr('fill',         col.fill)
        .attr('stroke',       col.stroke)
        .attr('stroke-width', 1.5);

      const tg = s.select('.tg');
      tg.selectAll('text').remove();
      lns.forEach((ln, i) =>
        tg.append('text')
          .attr('x',           BOX_W / 2)
          .attr('y',           V_PAD + (i + 0.72) * LINE_H)
          .attr('text-anchor', 'middle')
          .attr('font-size',   FONT_PX)
          .text(ln)
      );
    });
  }

  /* Initial render */
  render();
  fitView();

  /* Button handlers */
  document.getElementById('btnFit').addEventListener('click', fitView);
  document.getElementById('btnReset').addEventListener('click', () => {
    clrOff();
    render();
    fitView();
  });

  /* Resize: reset offsets and refit */
  let rTimer;
  window.addEventListener('resize', () => {
    clearTimeout(rTimer);
    clrOff();
    rTimer = setTimeout(() => { render(); fitView(); }, 160);
  });
}

main();
