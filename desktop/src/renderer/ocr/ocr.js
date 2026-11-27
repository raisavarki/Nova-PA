(() => {
  const box = document.getElementById('box'), dim = document.getElementById('dim');
  let sx = 0, sy = 0, dragging = false;
  window.nova.on((ev) => { if (ev.type === 'ocr-image') document.getElementById('img').src = ev.src; });
  document.addEventListener('mousedown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; box.style.display = 'block'; dim.style.display = 'none'; upd(e); });
  document.addEventListener('mousemove', (e) => dragging && upd(e));
  document.addEventListener('mouseup', (e) => {
    if (!dragging) return; dragging = false;
    const r = rect(e);
    window.nova.ocrRect(r);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.nova.ocrRect(null); });
  function rect(e) { return { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy) }; }
  function upd(e) { const r = rect(e); Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
})();
