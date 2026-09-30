// Fija el documento en su posición (incluido Safari iOS), sin bloquear el scroll del diálogo.
export function lockModalScroll(dialog, { doc = document, win = window } = {}) {
  const body = doc.body;
  const html = doc.documentElement;
  const x = win.scrollX;
  const y = win.scrollY;
  const gap = Math.max(0, win.innerWidth - html.clientWidth);
  const saved = [];
  function set(element, property, value) {
    saved.push([element, property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    element.style.setProperty(property, value, 'important');
  }
  const padding = parseFloat(win.getComputedStyle(body).paddingRight) || 0;
  set(html, 'scroll-behavior', 'auto');
  set(html, 'overflow', 'hidden');
  set(body, 'position', 'fixed');
  set(body, 'top', `${-y}px`);
  set(body, 'left', `${-x}px`);
  set(body, 'width', '100%');
  set(body, 'box-sizing', 'border-box');
  set(body, 'overflow', 'hidden');
  set(body, 'padding-right', `${padding + gap}px`);
  let touchY = 0;
  const start = (event) => { if (event.touches.length === 1) touchY = event.touches[0].clientY; };
  const move = (event) => {
    if (event.touches.length !== 1) return; // Mantener zoom por accesibilidad.
    const delta = touchY - event.touches[0].clientY;
    touchY = event.touches[0].clientY;
    const inside = dialog.contains(event.target);
    const atTop = dialog.scrollTop <= 0 && delta < 0;
    const atBottom = dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 1 && delta > 0;
    if (!inside || dialog.scrollHeight <= dialog.clientHeight || atTop || atBottom) event.preventDefault();
  };
  const wheel = (event) => { if (!dialog.contains(event.target)) event.preventDefault(); };
  doc.addEventListener('touchstart', start, { passive: true });
  doc.addEventListener('touchmove', move, { passive: false });
  doc.addEventListener('wheel', wheel, { passive: false });
  const viewport = () => {
    const height = win.visualViewport?.height || win.innerHeight;
    const top = win.visualViewport?.offsetTop || 0;
    const bottom = Math.max(0, win.innerHeight - height - top);
    dialog.style.setProperty('--email-viewport-height', `${height}px`);
    dialog.style.setProperty('--email-viewport-top', `${top}px`);
    dialog.style.setProperty('--email-viewport-bottom', `${bottom}px`);
  };
  win.visualViewport?.addEventListener('resize', viewport);
  win.visualViewport?.addEventListener('scroll', viewport);
  viewport();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener('touchstart', start);
    doc.removeEventListener('touchmove', move);
    doc.removeEventListener('wheel', wheel);
    win.visualViewport?.removeEventListener('resize', viewport);
    win.visualViewport?.removeEventListener('scroll', viewport);
    // Restaurar primero dimensiones; scroll-behavior se mantiene auto hasta recuperar la posición.
    for (const [element, property, value, priority] of saved.slice(1).reverse()) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    win.scrollTo(x, y);
    const [, property, value, priority] = saved[0];
    if (value) html.style.setProperty(property, value, priority);
    else html.style.removeProperty(property);
  };
}
