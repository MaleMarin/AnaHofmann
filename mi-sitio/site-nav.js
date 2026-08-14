/* Navegación del sitio: migas de pan + anterior/siguiente. */
(function () {
  const PIECES = [
    { href: "/apps/cromagenesis/", label: "Cromagénesis" },
    { href: "/apps/libelulas/", label: "Libélulas Vectoriales" },
    { href: "/apps/anatomia-de-la-distancia/", label: "Anatomía de la Distancia" },
  ];
  const SECTIONS = [
    { href: "/", label: "código" },
    { href: "/fotografia/", label: "fotografía" },
    { href: "/video/", label: "video" },
  ];

  function pathOf() {
    let p = location.pathname.replace(/\/index\.html$/, "") || "/";
    if (p.length > 1 && !p.endsWith("/")) p += "/";
    return p;
  }

  function same(a, b) {
    const n = (s) => (s.length > 1 && s.endsWith("/") ? s : s + "/");
    return n(a) === n(b) || a === b;
  }

  const path = pathOf();
  const pieceIdx = PIECES.findIndex((x) => path.startsWith(x.href.replace(/\/$/, "")) || same(path, x.href));
  const onHome = path === "/";
  const onFoto = path.startsWith("/fotografia");
  const onVideo = path.startsWith("/video");

  const crumbs = [];
  crumbs.push({ href: "/", label: "Ana Hofmann", current: onHome });

  if (pieceIdx >= 0) {
    crumbs.push({ href: "/#codigo", label: "código", current: false });
    crumbs.push({ href: PIECES[pieceIdx].href, label: PIECES[pieceIdx].label, current: true });
  } else if (onFoto) {
    crumbs.push({ href: "/fotografia/", label: "fotografía", current: true });
  } else if (onVideo) {
    crumbs.push({ href: "/video/", label: "video", current: true });
  }

  let prev = null;
  let next = null;
  let sectionLinks = null;
  if (pieceIdx >= 0) {
    if (pieceIdx > 0) prev = PIECES[pieceIdx - 1];
    if (pieceIdx < PIECES.length - 1) next = PIECES[pieceIdx + 1];
  } else if (onHome) {
    sectionLinks = SECTIONS;
  } else if (onFoto) {
    prev = { href: "/", label: "código" };
    next = { href: "/video/", label: "video" };
  } else if (onVideo) {
    prev = { href: "/fotografia/", label: "fotografía" };
  }

  const style = document.createElement("style");
  style.textContent = `
    .ah-nav{position:fixed;top:0;left:0;right:0;z-index:80;
      display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
      padding:14px 16px;pointer-events:none;
      font-family:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;
      font-size:12px;letter-spacing:.04em;line-height:1.2;
      background:transparent;color:#e8e4dc}
    .ah-nav a,.ah-nav span{pointer-events:auto}
    .ah-crumbs,.ah-pager{
      display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;
      background:#101216;color:#e8e4dc;
      padding:8px 12px;border-radius:6px;
      box-shadow:0 8px 24px rgba(0,0,0,.28);
    }
    .ah-crumbs{min-width:0}
    .ah-crumbs a{color:rgba(232,228,220,.72);text-decoration:none;transition:color .2s}
    .ah-crumbs a:hover{color:#fff}
    .ah-crumbs .ah-now{color:#fff;text-decoration:none}
    .ah-sep{color:rgba(232,228,220,.35);pointer-events:none}
    .ah-pager{flex-shrink:0;white-space:nowrap;gap:12px}
    .ah-pager a{color:rgba(232,228,220,.72);text-decoration:none;transition:color .2s}
    .ah-pager a:hover{color:#fff}
    .ah-pager .ah-off{color:rgba(232,228,220,.22);pointer-events:none}
    .ah-secs{display:flex;align-items:baseline;gap:8px;text-transform:lowercase;letter-spacing:.14em;font-size:11px}
    .ah-secs a{color:rgba(232,228,220,.72);text-decoration:none;transition:color .2s}
    .ah-secs a:hover{color:#fff}
    .page{padding-top:56px !important}
    .title{top:52px !important}
    @media(max-width:640px){
      .ah-nav{padding:10px 12px;font-size:11px}
      .ah-pager .ah-full{display:none}
    }
  `;
  document.head.appendChild(style);

  function crumbHtml() {
    return crumbs.map((c, i) => {
      const sep = i ? `<span class="ah-sep">/</span>` : "";
      if (c.current) return `${sep}<span class="ah-now">${c.label}</span>`;
      return `${sep}<a href="${c.href}">${c.label}</a>`;
    }).join("");
  }

  function pagerHtml() {
    if (sectionLinks) {
      return `<div class="ah-secs">${sectionLinks.map((s, i) => {
        const sep = i ? `<span class="ah-sep">·</span>` : "";
        return `${sep}<a href="${s.href}">${s.label}</a>`;
      }).join("")}</div>`;
    }
    const back = prev
      ? `<a href="${prev.href}">‹ <span class="ah-full">${prev.label}</span></a>`
      : `<span class="ah-off">‹</span>`;
    const fwd = next
      ? `<a href="${next.href}"><span class="ah-full">${next.label}</span> ›</a>`
      : `<span class="ah-off">›</span>`;
    return back + fwd;
  }

  const bar = document.createElement("nav");
  bar.className = "ah-nav";
  bar.setAttribute("aria-label", "migas de pan");
  bar.innerHTML = `<div class="ah-crumbs">${crumbHtml()}</div><div class="ah-pager">${pagerHtml()}</div>`;
  document.body.appendChild(bar);
})();
