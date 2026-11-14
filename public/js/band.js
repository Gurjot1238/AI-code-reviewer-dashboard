// Drifting star band (the signature visual on the landing and auth pages).
function starBand(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, dots = [], stars = [];
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = []; stars = [];
    for (let i = 0; i < W * 5; i++) {
      const x = Math.random() * W;
      dots.push({ x, o: gauss() * (H * .16 + H * .1 * Math.sin(x / W * Math.PI * 3 + 1)), r: Math.random() < .9 ? .7 : 1.3, a: .2 + Math.random() * .6, s: .1 + Math.random() * .12 });
    }
    for (let i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: .8 + Math.random() * 2, a: .3 + Math.random() * .6, s: .04 + Math.random() * .05 });
  }
  const center = (x, t) => H * .5 + Math.sin(x / W * Math.PI * 2 + t * .0002) * H * .14;
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8e1d3';
    for (const d of dots) { const x = (d.x + t * d.s * .02) % W; ctx.globalAlpha = d.a; ctx.fillRect(x, center(x, t) + d.o, d.r, d.r); }
    for (const s of stars) { const x = (s.x + t * s.s * .02) % W; ctx.globalAlpha = s.a; ctx.beginPath(); ctx.arc(x, s.y, s.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  build();
  if (reduce) return draw(0);
  (function loop(t) { if (!document.hidden) draw(t); requestAnimationFrame(loop); })(0);
  window.addEventListener('resize', build);
}
