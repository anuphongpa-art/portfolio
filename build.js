#!/usr/bin/env node
// Generates a static HTML file for each post in posts/index.json
// Run: node build.js
// Output: posts/{id}.html + sitemap.xml

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://beeanuphong.com';
const POSTS_DIR = path.join(__dirname, 'posts');

// ── Helpers ─────────────────────────────────────────────────────────────────

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── Block renderer (mirrors post.html JS logic) ──────────────────────────────

function renderBlocks(blocks) {
  if (!blocks || !blocks.length) return '';
  return blocks.map(block => {
    const d = block.data || {};
    switch (block.type) {
      case 'paragraph':
        return `<p>${d.text || ''}</p>`;

      case 'header': {
        const lvl = Math.min(Math.max(parseInt(d.level) || 2, 1), 4);
        return `<h${lvl}>${d.text || ''}</h${lvl}>`;
      }

      case 'list': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul';
        const items = (d.items || []).map(item => {
          const text = typeof item === 'string' ? item : (item.content || '');
          return `<li>${text}</li>`;
        }).join('');
        return `<${tag}>${items}</${tag}>`;
      }

      case 'checklist': {
        const items = (d.items || []).map(item => {
          const checked = item.checked ? true : false;
          const liCls = checked ? ' class="done"' : '';
          const boxCls = 'post-check-box' + (checked ? ' checked' : '');
          return `<li${liCls}><span class="${boxCls}"></span><span>${item.text || ''}</span></li>`;
        }).join('');
        return `<ul class="post-checklist">${items}</ul>`;
      }

      case 'code':
        return `<pre><code>${escAttr(d.code || '')}</code></pre>`;

      case 'quote': {
        const cite = d.caption ? `<cite>${escAttr(d.caption)}</cite>` : '';
        return `<blockquote><p>${d.text || ''}</p>${cite}</blockquote>`;
      }

      case 'warning': {
        const ttl = d.title ? `<strong class="post-callout-title">${escAttr(d.title)}</strong>` : '';
        return `<div class="post-callout">${ttl}<p>${d.message || ''}</p></div>`;
      }

      case 'callout': {
        const em = escAttr(d.emoji || '💡');
        return `<div class="post-callout-notion"><span class="post-callout-notion__emoji">${em}</span><div class="post-callout-notion__text">${d.text || ''}</div></div>`;
      }

      case 'delimiter':
        return '<hr class="post-delimiter">';

      case 'image': {
        const url = (d.file && d.file.url) || d.url || '';
        if (!url) return '';
        const cap = d.caption ? `<figcaption>${d.caption}</figcaption>` : '';
        let cls = 'post-image';
        if (d.withBorder) cls += ' with-border';
        if (d.stretched) cls += ' stretched';
        if (d.withBackground) cls += ' with-bg';
        return `<figure class="${cls}"><img src="${escAttr(url)}" alt="${escAttr(d.caption || '')}" loading="lazy">${cap}</figure>`;
      }

      case 'embed': {
        if (!d.embed) return '';
        const cap2 = d.caption ? `<figcaption>${escAttr(d.caption)}</figcaption>` : '';
        const w = d.width || 560;
        const h = d.height || 315;
        return `<figure class="post-embed"><iframe src="${escAttr(d.embed)}" width="${w}" height="${h}" frameborder="0" allowfullscreen loading="lazy"></iframe>${cap2}</figure>`;
      }

      case 'attaches': {
        if (!d.file || !d.file.url) return '';
        const ext = (d.file.extension || '').toUpperCase() || 'FILE';
        const sz = d.file.size ? fmtBytes(d.file.size) : '';
        const nm = escAttr(d.file.name || d.title || 'Download');
        return `<a href="${escAttr(d.file.url)}" class="post-attaches" download target="_blank" rel="noopener"><span class="post-attaches-icon">📎</span><span class="post-attaches-info"><span class="post-attaches-name">${nm}</span>${sz ? `<span class="post-attaches-size">${escAttr(ext)} · ${escAttr(sz)}</span>` : ''}</span></a>`;
      }

      case 'table': {
        const rows = d.content || [];
        if (!rows.length) return '';
        let html = '<div class="post-table-wrap"><table class="post-table">';
        rows.forEach((row, i) => {
          html += '<tr>';
          row.forEach(cell => {
            const t = (d.withHeadings && i === 0) ? 'th' : 'td';
            html += `<${t}>${cell}</${t}>`;
          });
          html += '</tr>';
        });
        return html + '</table></div>';
      }

      case 'raw':
        return d.html || '';

      default:
        return '';
    }
  }).filter(Boolean).join('\n');
}

// ── HTML template ────────────────────────────────────────────────────────────

function coverAbsUrl(cover) {
  if (!cover) return `${BASE_URL}/images/profile.png`;
  if (cover.startsWith('http')) return cover;
  return `${BASE_URL}/${cover}`;
}

// assetBase: relative path from the generated file back to site root
// e.g. '../' for posts/{id}.html, '../../' for blog/{slug}/index.html
function generatePostHtml(post, assetBase, pageUrl) {
  const title = post.title || 'Untitled';
  const excerpt = stripHtml(post.excerpt || '').slice(0, 200);
  const ogImage = coverAbsUrl(post.cover);
  const tags = (post.tags || []).map(t => `<span class="post-tag">${escAttr(t)}</span>`).join('');
  const blocks = (post.content && post.content.blocks) || [];
  const dateDisplay = formatDate(post.created_at);
  const postStyle = post.style || {};
  const bodyClasses = [
    postStyle.font === 'serif' ? 'font-serif' : '',
    postStyle.font === 'mono'  ? 'font-mono'  : '',
    postStyle.small    ? 'small-text'  : '',
    postStyle.fullWidth ? 'full-width' : '',
  ].filter(Boolean).join(' ');

  // cover src: absolute URLs pass through; relative paths need assetBase prefix
  const coverSrc = post.cover
    ? (post.cover.startsWith('http') ? post.cover : assetBase + post.cover)
    : '';

  // JSON-LD structured data for Google
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: excerpt,
    image: ogImage,
    datePublished: post.created_at || '',
    dateModified: post.updated_at || post.created_at || '',
    author: { '@type': 'Person', name: 'Bee Anuphong', url: BASE_URL },
    publisher: { '@type': 'Person', name: 'Bee Anuphong' },
    url: pageUrl,
    inLanguage: 'th',
  });

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escAttr(title)} — Bee Anuphong</title>
<link rel="canonical" href="${pageUrl}">
<meta name="description" content="${escAttr(excerpt)}">
<meta name="author" content="Bee Anuphong">
<link rel="icon" type="image/svg+xml" href="${assetBase}favicon.svg">
<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(excerpt)}">
<meta property="og:image" content="${escAttr(ogImage)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:locale" content="th_TH">
<meta property="article:published_time" content="${escAttr(post.created_at || '')}">
<meta property="article:modified_time" content="${escAttr(post.updated_at || post.created_at || '')}">
<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(excerpt)}">
<meta name="twitter:image" content="${escAttr(ogImage)}">
<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${assetBase}style.css">
<style>
#post-page { min-height: calc(100vh - 66px); padding: 5.5rem 2rem 5rem; }
.post-wrap { max-width: 720px; margin: 0 auto; }
.post-breadcrumb { display:flex; align-items:center; gap:0.5rem; margin-bottom:2.5rem; font-size:0.8rem; color:var(--muted); min-width:0; }
.post-breadcrumb a { color:var(--sub); text-decoration:none; transition:color 0.2s; white-space:nowrap; }
.post-breadcrumb a:hover { color:var(--text); }
.post-breadcrumb-sep { opacity:0.4; flex-shrink:0; }
.post-breadcrumb > span:not(.post-breadcrumb-sep) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.post-header { margin-bottom:2.5rem; }
.post-meta-row { display:flex; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem; }
.post-date { font-size:0.78rem; color:var(--muted); font-variant-numeric:tabular-nums; }
.post-tag { display:inline-block; font-size:0.7rem; font-weight:500; padding:0.15rem 0.55rem; border-radius:100px; background:var(--glass); border:1px solid var(--dim); color:var(--sub); letter-spacing:0.04em; text-transform:uppercase; }
.post-title { font-family:var(--serif); font-size:clamp(1.8rem,5vw,2.8rem); font-weight:700; color:var(--text); letter-spacing:-0.02em; line-height:1.2; }
.post-header-divider { margin-top:2rem; height:1px; background:var(--dim); }
.post-body { font-size:1rem; line-height:1.85; color:var(--text); }
.post-body > * + * { margin-top:1.4em; }
.post-body h1 { font-family:var(--serif); font-size:clamp(1.9rem,5vw,2.4rem); font-weight:700; color:var(--text); letter-spacing:-0.03em; line-height:1.2; margin-top:2.5em; }
.post-body h2 { font-family:var(--serif); font-size:1.6rem; font-weight:700; color:var(--text); letter-spacing:-0.02em; line-height:1.25; margin-top:2.5em; }
.post-body h3 { font-family:var(--serif); font-size:1.25rem; font-weight:600; color:var(--text); letter-spacing:-0.01em; line-height:1.3; margin-top:2em; }
.post-body h4 { font-family:var(--sans); font-size:0.8rem; font-weight:600; color:var(--sub); text-transform:uppercase; letter-spacing:0.08em; margin-top:1.8em; }
.post-body p { color:var(--text); }
.post-body a { color:var(--teal); text-decoration:underline; text-underline-offset:3px; }
.post-body a:hover { color:var(--text); }
.post-body strong,.post-body b { font-weight:600; color:var(--text); }
.post-body em,.post-body i { font-style:italic; color:var(--sub); }
.post-body code { font-family:'Courier New','Fira Code',monospace; font-size:0.85em; padding:0.15em 0.4em; border-radius:4px; background:rgba(255,255,255,0.07); color:var(--teal); border:1px solid var(--dim); }
.post-body ul,.post-body ol { padding-left:1.6em; color:var(--text); }
.post-body li+li { margin-top:0.35em; }
.post-body ul li { list-style:disc; }
.post-body ol li { list-style:decimal; }
.post-body blockquote { border-left:3px solid var(--text); padding:0.25rem 0 0.25rem 1rem; margin:1em 0; color:var(--text); font-style:normal; font-size:1.05rem; background:transparent; }
.post-body blockquote p { margin:0; }
.post-body blockquote cite { display:block; margin-top:0.4rem; font-size:0.82rem; font-style:italic; color:var(--muted); }
.post-body pre { background:rgba(255,255,255,0.05); border:none; border-radius:4px; padding:14px 16px; overflow-x:auto; margin:1em 0; }
.post-body pre code { background:none; border:none; padding:0; font-family:'SF Mono','Monaco','Menlo','Consolas','Courier New',monospace; font-size:0.875rem; line-height:1.55; color:#e6edf3; }
.post-body hr.post-delimiter { border:none; text-align:center; margin:2.5em 0; color:var(--muted); }
.post-body hr.post-delimiter::before { content:'* * *'; letter-spacing:0.5em; font-size:1rem; }
.post-checklist { list-style:none; padding-left:0; }
.post-checklist li { display:flex; align-items:flex-start; gap:0.6rem; padding:0.2rem 0; }
.post-check-box { width:15px; height:15px; border:1.5px solid var(--dim); border-radius:3px; flex-shrink:0; margin-top:0.22em; display:inline-block; background:transparent; }
.post-check-box.checked { background:var(--teal); border-color:var(--teal); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8l4 4 6-8' stroke='%2307090F' stroke-width='2.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-size:contain; }
.post-checklist li.done > span:last-child { text-decoration:line-through; color:var(--muted); }
.post-table-wrap { overflow-x:auto; border-radius:var(--rs); border:1px solid var(--dim); margin:1em 0; }
.post-table { border-collapse:collapse; width:100%; }
.post-table th,.post-table td { padding:0.5rem 0.85rem; border:1px solid var(--dim); color:var(--text); font-size:0.9rem; }
.post-table th { background:rgba(255,255,255,0.04); font-weight:600; color:var(--sub); text-align:left; }
.post-body figure { margin:1.75em 0; }
.post-image img { width:100%; border-radius:var(--rs); display:block; }
.post-image.with-border img { border:1px solid var(--dim); }
.post-image.with-bg { padding:1rem; background:rgba(255,255,255,0.03); border-radius:var(--r); }
.post-image.stretched img { width:calc(100% + 4rem); margin-left:-2rem; border-radius:0; }
.post-image figcaption,.post-embed figcaption { text-align:center; font-size:0.8rem; color:var(--muted); margin-top:0.5rem; font-style:italic; }
.post-embed { text-align:center; }
.post-embed iframe { max-width:100%; border-radius:var(--rs); }
.post-callout { padding:0.85rem 1rem 0.85rem 1.25rem; background:rgba(232,148,58,0.06); border:1px solid rgba(232,148,58,0.2); border-radius:var(--rs); border-left:3px solid var(--amber); margin:1em 0; }
.post-callout-title { color:var(--amber); display:block; margin-bottom:0.3rem; font-size:0.9rem; font-weight:600; }
.post-callout p { margin:0; color:var(--text); }
.post-callout-notion { display:flex; gap:12px; align-items:flex-start; background:rgba(255,255,255,0.04); border-radius:4px; padding:14px 16px; margin:1em 0; }
.post-callout-notion__emoji { font-size:1.25rem; line-height:1.6; flex-shrink:0; min-width:1.5em; text-align:center; }
.post-callout-notion__text { flex:1; color:var(--text); line-height:1.6; min-width:0; word-break:break-word; }
.post-callout-notion__text p:first-child { margin-top:0; }
.post-callout-notion__text p:last-child { margin-bottom:0; }
.post-attaches { display:flex; align-items:center; gap:0.85rem; padding:0.75rem 1rem; background:var(--glass2); border:1px solid var(--dim); border-radius:var(--rs); text-decoration:none; transition:border-color 0.2s; }
.post-attaches:hover { border-color:var(--teal); }
.post-attaches-icon { font-size:1.4rem; flex-shrink:0; }
.post-attaches-info { flex:1; min-width:0; }
.post-attaches-name { color:var(--text); font-size:0.9rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.post-attaches-size { color:var(--muted); font-size:0.75rem; }
mark { background:rgba(255,220,50,0.22); border-radius:2px; color:var(--text); padding:0.05em 0.2em; }
body.font-serif .post-title,body.font-serif .post-body,body.font-serif .post-body p,body.font-serif .post-body li { font-family:var(--serif); }
body.font-mono .post-title,body.font-mono .post-body,body.font-mono .post-body p,body.font-mono .post-body li { font-family:'Courier New','Fira Code',monospace; letter-spacing:-0.01em; }
body.small-text .post-body { font-size:0.9rem; line-height:1.7; }
body.full-width .post-wrap { max-width:1080px; }
.btn-edit-post { display:inline-flex; align-items:center; gap:0.35rem; padding:0.35rem 0.75rem; border-radius:var(--rs); background:var(--glass2); border:1px solid var(--gb); color:var(--sub); font-size:0.75rem; font-weight:500; text-decoration:none; transition:background 0.2s,color 0.2s; margin-left:auto; flex-shrink:0; }
.btn-edit-post:hover { background:var(--gbhi); color:var(--text); }
.post-footer { margin-top:4rem; padding-top:2rem; border-top:1px solid var(--dim); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; }
.post-footer-back { display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; color:var(--sub); text-decoration:none; transition:color 0.2s; }
.post-footer-back:hover { color:var(--text); }
.post-cover-img { width:100%; border-radius:var(--r,8px); margin-bottom:2.5rem; display:block; aspect-ratio:16/9; object-fit:cover; }
</style>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body${bodyClasses ? ` class="${bodyClasses}"` : ''}>

<button id="back-to-top" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Back to top">↑</button>
<div id="scroll-progress"></div>

<nav>
  <a href="${assetBase}index.html" class="nav-brand">Bee Anuphong</a>
  <ul class="nav-menu">
    <li><a href="${assetBase}blog.html">Blog</a></li>
    <li class="nav-has-dropdown">
      <a href="${assetBase}about.html">About Me</a>
      <ul class="nav-dropdown">
        <li><a href="${assetBase}about.html#profile">Profile</a></li>
        <li><a href="${assetBase}about.html#experience">Experience</a></li>
        <li><a href="${assetBase}about.html#volunteering">Activities</a></li>
        <li><a href="${assetBase}about.html#education">Education</a></li>
        <li><a href="${assetBase}about.html#certifications">Certifications</a></li>
        <li><a href="${assetBase}about.html#contact">Contact</a></li>
      </ul>
    </li>
  </ul>
  <button class="nav-hamburger" id="hamburger" aria-label="Toggle menu">
    <span></span><span></span><span></span>
  </button>
</nav>

<nav class="nav-drawer" id="drawer">
  <a href="${assetBase}blog.html">Blog</a>
  <div class="drawer-divider"><span>About Me</span></div>
  <a href="${assetBase}about.html#profile" class="drawer-sub">Profile</a>
  <a href="${assetBase}about.html#experience" class="drawer-sub">Experience</a>
  <a href="${assetBase}about.html#volunteering" class="drawer-sub">Activities</a>
  <a href="${assetBase}about.html#education" class="drawer-sub">Education</a>
  <a href="${assetBase}about.html#certifications" class="drawer-sub">Certifications</a>
  <a href="${assetBase}about.html#contact" class="drawer-sub">Contact</a>
</nav>

<section id="post-page">
  <div class="post-wrap">
    <div class="post-breadcrumb">
      <a href="${assetBase}blog.html">Blog</a>
      <span class="post-breadcrumb-sep">/</span>
      <span>${escAttr(title)}</span>
      <a href="${assetBase}editor.html?id=${escAttr(post.id)}" class="btn-edit-post"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</a>
    </div>
    <header class="post-header">
      <div class="post-meta-row">
        <time class="post-date" datetime="${escAttr(post.created_at || '')}">${dateDisplay}</time>
        ${tags}
      </div>
      <h1 class="post-title">${escAttr(title)}</h1>
      <div class="post-header-divider"></div>
    </header>
    ${coverSrc ? `<img class="post-cover-img" src="${escAttr(coverSrc)}" alt="${escAttr(title)}" loading="eager">` : ''}
    <article class="post-body">
      ${renderBlocks(blocks)}
    </article>
    <footer class="post-footer">
      <a href="${assetBase}blog.html" class="post-footer-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Back to Blog
      </a>
    </footer>
  </div>
</section>

<footer>
  <div class="f-brand">Bee Anuphong</div>
  <div class="f-social">
    <a href="mailto:anuphong3502@gmail.com">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      anuphong3502@gmail.com
    </a>
    <a href="https://www.instagram.com/beeyopatt" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg>
      @beeyopatt
    </a>
  </div>
  <span class="f-copy">© 2026 · Bangkok, Thailand</span>
</footer>

<script src="${assetBase}script.js"></script>
<script>
document.addEventListener('keydown', function(e) {
  if (e.shiftKey && e.key === 'G' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    var tag = document.activeElement && document.activeElement.tagName.toLowerCase();
    var isEditable = document.activeElement && (document.activeElement.isContentEditable || tag === 'input' || tag === 'textarea');
    if (!isEditable) { e.preventDefault(); window.location.href = '${assetBase}editor.html?id=${escAttr(post.id)}'; }
  }
});
</script>
</body>
</html>`;
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

function generateSitemap(posts) {
  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { url: `${BASE_URL}/`, priority: '1.0', changefreq: 'monthly' },
    { url: `${BASE_URL}/blog.html`, priority: '0.9', changefreq: 'weekly' },
    { url: `${BASE_URL}/about.html`, priority: '0.7', changefreq: 'monthly' },
  ];
  const postPages = posts.map(p => ({
    url: p.slug ? `${BASE_URL}/blog/${p.slug}/` : `${BASE_URL}/posts/${p.id}.html`,
    lastmod: (p.updated_at || p.created_at || today).split('T')[0],
    priority: '0.8',
    changefreq: 'monthly',
  }));
  const all = [...staticPages, ...postPages];
  const urls = all.map(p => `  <url>
    <loc>${p.url}</loc>${p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const indexPath = path.join(POSTS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.log('No posts/index.json found — skipping build.');
    return;
  }

  const posts = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!posts.length) {
    console.log('No posts in index.json — skipping build.');
    return;
  }

  const BLOG_DIR = path.join(__dirname, 'blog');

  let built = 0;
  for (const meta of posts) {
    const jsonPath = path.join(POSTS_DIR, `${meta.id}.json`);
    if (!fs.existsSync(jsonPath)) {
      console.warn(`  skip ${meta.id} — JSON not found`);
      continue;
    }
    const post = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    if (post.slug) {
      // Slug-based: generate blog/{slug}/index.html
      const slugDir = path.join(BLOG_DIR, post.slug);
      if (!fs.existsSync(slugDir)) fs.mkdirSync(slugDir, { recursive: true });
      const pageUrl = `${BASE_URL}/blog/${post.slug}/`;
      const html = generatePostHtml(post, '../../', pageUrl);
      fs.writeFileSync(path.join(slugDir, 'index.html'), html, 'utf8');
      console.log(`  ✓ blog/${post.slug}/index.html`);

      // Write a redirect at posts/{id}.html for backwards compatibility
      const redirect = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="canonical" href="${pageUrl}"><meta http-equiv="refresh" content="0;url=${pageUrl}"></head><body><script>window.location.replace('${pageUrl}');<\/script></body></html>`;
      fs.writeFileSync(path.join(POSTS_DIR, `${post.id}.html`), redirect, 'utf8');
    } else {
      // No slug: generate posts/{id}.html as before
      const pageUrl = `${BASE_URL}/posts/${post.id}.html`;
      const html = generatePostHtml(post, '../', pageUrl);
      fs.writeFileSync(path.join(POSTS_DIR, `${post.id}.html`), html, 'utf8');
      console.log(`  ✓ posts/${post.id}.html`);
    }
    built++;
  }

  // Sitemap
  const sitemap = generateSitemap(posts);
  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap, 'utf8');
  console.log(`  ✓ sitemap.xml`);

  console.log(`\nBuild complete: ${built} post(s) generated.`);
}

main();
