import { FONT_PAIRS, FONTS, fontFaces } from './fonts';
import type { SiteSettings } from '../shared/types';

/**
 * Four style directions, each with its own typographic voice, rule system
 * and component shapes – not a colour swap of one template.
 *
 *  Kante       – Swiss grid, numbered sections, hairlines, one signal colour.
 *  Bistro      – warm paper, soft serif, dotted leaders, rounded buttons.
 *  Salon       – dark, high-contrast Didone, brass rules, letterspaced caps.
 *  Feuilleton  – editorial serif, masthead header, drop caps, date columns.
 */

export interface Palette {
  id: string;
  label: string;
  bg: string;
  surface: string;
  ink: string;
  ink2: string;
  line: string;
  accent: string;
  accentInk: string;
  /** Inverse section colours. */
  invBg: string;
  invInk: string;
  invInk2: string;
  invLine: string;
  dark?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  pair: string;
  palettes: Palette[];
  css: string;
  /** Header layout. */
  header: 'bar' | 'masthead' | 'centered';
  /** Small typographic ornament for dividers. */
  ornament: string;
  /** Section numbers in front of block headings ("01"). */
  numbered: boolean;
}

/* ---------- Fluid modular scale (1.2 on phones → 1.25 on wide screens) ---------- */

function fluid(minRem: number, maxRem: number, minVw = 22, maxVw = 80): string {
  const slope = (maxRem - minRem) / (maxVw - minVw);
  const intercept = minRem - slope * minVw;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `clamp(${r(minRem)}rem, ${r(intercept)}rem + ${r(slope * 100)}vw, ${r(maxRem)}rem)`;
}

const steps: string[] = [];
for (let i = -2; i <= 8; i++) {
  const min = 1 * Math.pow(1.2, i);
  const max = 1.0625 * Math.pow(1.25, i);
  steps.push(`--step-${i < 0 ? `n${-i}` : i}:${fluid(min, max)}`);
}
const SCALE = steps.join(';');

/* ---------- Base CSS shared by all themes ---------- */

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;color-scheme:var(--scheme,light)}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:var(--step-0);line-height:1.6;font-kerning:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
img,picture,video,svg{display:block;max-width:100%}
img{height:auto}
a{color:inherit;text-decoration-thickness:.06em;text-underline-offset:.2em;text-decoration-color:color-mix(in srgb,currentColor 40%,transparent);text-decoration-skip-ink:auto;transition:text-decoration-color .15s,text-decoration-thickness .15s,text-underline-offset .15s}
a:hover{text-decoration-color:var(--accent);text-decoration-thickness:.12em;text-underline-offset:.24em}
a:active{color:var(--accent)}
a:focus-visible{border-radius:2px}
::selection{background:color-mix(in srgb,var(--accent) 32%,transparent)}
/* anchors land below a sticky header, not behind it */
[id]{scroll-margin-top:6rem}
/* page changes cross-fade instead of a hard flash; the header stays put */
@view-transition{navigation:auto}
.site-header{view-transition-name:site-header}
::view-transition-old(root),::view-transition-new(root){animation-duration:.22s}
@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
button,input,select,textarea{font:inherit;color:inherit;accent-color:var(--accent)}
p{margin:0 0 1em}
h1,h2,h3,h4{font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);line-height:var(--display-leading);margin:0;text-wrap:balance;font-variation-settings:var(--display-axes,normal)}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:1rem;top:1rem;z-index:100;background:var(--ink);color:var(--bg);padding:.6rem 1rem}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{width:min(100% - 2*var(--gutter),var(--max));margin-inline:auto}
.measure{max-width:var(--measure)}
.label{font-family:var(--font-label,var(--font-body));font-size:var(--step-n1);letter-spacing:var(--label-tracking,.08em);text-transform:var(--label-case,uppercase);font-weight:var(--label-weight,600);color:var(--ink-2)}
.muted{color:var(--ink-2)}
.lead{font-size:var(--step-1);line-height:1.5;color:var(--ink-2);max-width:36em}

/* rhythm */
.b{--sp:var(--sp-m);padding-block:var(--sp);position:relative}
.sp-none{--sp:0px}.sp-s{--sp:var(--sp-s)}.sp-m{--sp:var(--sp-m)}.sp-l{--sp:var(--sp-l)}
.b[data-tone=default]+.b[data-tone=default]{padding-top:calc(var(--sp)*.4)}
@media (max-width:40rem){.spm-none{--sp:0px}.spm-s{--sp:var(--sp-s)}.spm-m{--sp:var(--sp-m)}.spm-l{--sp:var(--sp-l)}.hide-mobile{display:none!important}}
@media (min-width:40.01rem) and (max-width:64rem){.hide-tablet{display:none!important}}
@media (min-width:64.01rem){.hide-desktop{display:none!important}}
.tone-muted{background:var(--surface)}
.tone-accent{--ink:var(--accent-ink);--ink-2:color-mix(in srgb,var(--accent-ink) 78%,transparent);--line:color-mix(in srgb,var(--accent-ink) 30%,transparent);--btn-bg:var(--accent-ink);--btn-ink:var(--accent);background:var(--accent);color:var(--ink)}
.tone-inverse{--bg:var(--inv-bg);--ink:var(--inv-ink);--ink-2:var(--inv-ink2);--line:var(--inv-line);--surface:var(--inv-bg);background:var(--bg);color:var(--ink)}

/* buttons */
.actions{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center;margin-top:var(--s-4)}
.btn{display:inline-flex;align-items:center;gap:.5em;min-height:2.75rem;padding:var(--btn-pad,.7em 1.3em);border:var(--btn-border,0);border-radius:var(--btn-radius,2px);background:var(--btn-bg,var(--ink));color:var(--btn-ink,var(--bg));font-family:var(--btn-font,var(--font-body));font-weight:var(--btn-weight,600);font-size:var(--btn-size,var(--step-0));letter-spacing:var(--btn-tracking,0);text-transform:var(--btn-case,none);text-decoration:none;cursor:pointer;transition:transform .15s,background-color .15s,color .15s}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-2{display:inline-flex;align-items:center;gap:.4em;min-height:2.75rem;font-weight:600;text-decoration:underline;text-decoration-color:var(--line)}
.btn-2::after{content:"→";transition:transform .15s}.btn-2:hover::after{transform:translateX(3px)}
/* buttons: own states instead of browser defaults (grey face, tap flash, no disabled/busy look) */
html{-webkit-tap-highlight-color:transparent}
.btn{position:relative;-webkit-user-select:none;user-select:none}
.btn:active{transform:translateY(0) scale(.98)}
.btn:disabled,.btn[aria-disabled=true]{opacity:.45;cursor:not-allowed;transform:none}
.btn[aria-busy=true]{color:transparent!important;background:var(--btn-bg,var(--ink))!important;cursor:progress;transform:none}
.btn[aria-busy=true]::after{content:"";position:absolute;inset:0;margin:auto;width:1.15em;height:1.15em;border:2px solid var(--btn-ink,var(--bg));border-right-color:transparent;border-radius:50%;animation:nspin .7s linear infinite}
@keyframes nspin{to{transform:rotate(1turn)}}
button.btn-2{padding:0;border:0;background:none;color:inherit;cursor:pointer}
button.btn-2::after{content:none}
button.btn-2:hover{text-decoration-color:var(--accent)}
button.btn-2:disabled,button.btn-2[aria-busy=true]{opacity:.5;cursor:progress}
.btn-2[data-step-back]::before{content:"←";transition:transform .15s}.btn-2[data-step-back]:hover::before{transform:translateX(-3px)}

/* header */
.site-header{position:relative;z-index:20;background:var(--bg);border-bottom:1px solid var(--header-rule,transparent)}
.site-header.sticky{position:sticky;top:0}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;min-height:4.25rem}
.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none;font-family:var(--font-display);font-weight:var(--brand-weight,var(--display-weight));font-size:var(--brand-size,var(--step-1));letter-spacing:var(--display-tracking);line-height:1}
.brand img{height:2.25rem;width:auto}
.nav{display:flex;align-items:center;gap:var(--nav-gap,1.75rem)}
.nav ul{list-style:none;margin:0;padding:0;display:flex;gap:var(--nav-gap,1.75rem)}
.nav a{text-decoration:none;font-size:var(--nav-size,var(--step-0));font-weight:var(--nav-weight,500);padding-bottom:.3em;background:linear-gradient(var(--accent),var(--accent)) 0 100%/0 2px no-repeat;transition:background-size .25s cubic-bezier(.2,.7,.2,1)}
.nav a:hover,.nav a[aria-current=page]{background-size:100% 2px}
.nav a:active{color:inherit}
.nav li{position:relative}
.nav .sub{position:absolute;top:100%;left:-1rem;min-width:13rem;padding:.75rem 1rem;background:var(--bg);border:1px solid var(--line);display:none;flex-direction:column;gap:.5rem;box-shadow:0 12px 32px -16px rgb(0 0 0/.25)}
.nav li:hover>.sub,.nav li:focus-within>.sub{display:flex}
.cart-link{position:relative;display:inline-flex;align-items:center;gap:.35rem;text-decoration:none;font-weight:600}
.cart-count{min-width:1.4rem;height:1.4rem;padding:0 .35rem;border-radius:1rem;background:var(--accent);color:var(--accent-ink);font-size:.75rem;display:inline-grid;place-items:center}
.menu-toggle{display:none}
@media (max-width:52rem){
 .menu-toggle{display:block}
 .menu-toggle>summary{list-style:none;cursor:pointer;min-height:2.75rem;display:flex;align-items:center;gap:.5rem;font-weight:600}
 .menu-toggle>summary::-webkit-details-marker{display:none}
 .menu-toggle>summary .bars{width:1.25rem;height:.75rem;border-block:2px solid currentColor;position:relative}
 .menu-toggle>summary .bars::after{content:"";position:absolute;left:0;right:0;top:50%;border-top:2px solid currentColor;transform:translateY(-50%)}
 .menu-toggle[open]>summary .bars{border-color:transparent}
 .menu-toggle[open]>summary .bars::after{border-top-color:currentColor}
 .nav.desktop{display:none}
 .menu-panel{position:absolute;left:0;right:0;top:100%;background:var(--bg);border-bottom:1px solid var(--line);padding:1rem var(--gutter) 2rem}
 .menu-panel ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
 .menu-panel a{display:block;padding:.85rem 0;border-bottom:1px solid var(--line);text-decoration:none;font-family:var(--font-display);font-size:var(--step-2)}
 .menu-panel .sub a{font-size:var(--step-0);padding-left:1rem;font-family:var(--font-body)}
 .menu-panel .btn{margin-top:1.5rem}
}
@media (min-width:52.01rem){.menu-toggle{display:none}}

/* breadcrumbs */
.crumbs{font-size:var(--step-n1);color:var(--ink-2);padding-top:1.25rem}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.4rem}
.crumbs li+li::before{content:"/";margin-right:.4rem;color:var(--line)}
.crumbs a{text-decoration:none}

/* footer */
.site-footer{margin-top:var(--sp-m);padding-block:var(--sp-s) 2rem;border-top:1px solid var(--line);font-size:var(--step-n1);color:var(--ink-2)}
.ftr{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
.ftr h2{font-family:var(--font-body);font-size:var(--step-n1);letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--ink);margin-bottom:.75rem}
.ftr ul{list-style:none;margin:0;padding:0;display:grid;gap:.35rem}
.ftr a{text-decoration:underline;text-decoration-color:transparent}.ftr a:hover{text-decoration-color:var(--accent)}
.ftr-name{font-family:var(--font-display);font-size:var(--step-2);color:var(--ink);letter-spacing:var(--display-tracking);margin-bottom:.5rem;line-height:1.1}
.ftr-bottom{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line)}
.ftr-bottom ul{display:flex;gap:1.25rem}

/* section heads */
.bh{display:grid;gap:.75rem;margin-bottom:var(--s-6)}
.bh h2{font-size:var(--h2-size,var(--step-5))}
.bh p{color:var(--ink-2);max-width:40em;margin:0;font-size:var(--step-1);line-height:1.5}

/* hero */
.hero h1,.hero .h{font-size:var(--hero-size,var(--step-7));max-width:var(--hero-measure,16ch)}
.hero .eyebrow{margin-bottom:var(--s-4)}
.hero .lead{margin-top:var(--s-5)}
.hero-split{display:grid;gap:var(--s-7);align-items:center}
@media (min-width:56rem){.hero-split{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}.hero-split .h{--hero-size:var(--step-6)}}
.hero-split picture img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--img-radius,0)}
.hero-cover{padding:0!important}
.hero-cover .cover-media img{width:100%;height:min(88vh,56rem);min-height:26rem;object-fit:cover}
.hero-cover .cover-panel{position:relative;margin-top:-6rem;background:var(--bg);padding:var(--s-6) var(--s-6) var(--s-5) 0;max-width:46rem}
@media (max-width:40rem){.hero-cover .cover-panel{margin-top:-2.5rem;padding-right:var(--s-4)}}
.hero-cover .h{--hero-size:var(--step-6)}

/* prose */
.prose{max-width:var(--measure)}
.prose a{overflow-wrap:break-word}
/* external links and PDFs say what they are */
.prose a[rel~=noopener]::after{content:" ↗" / "";font-size:.8em;display:inline-block;text-decoration:none;transition:transform .15s}
.prose a[rel~=noopener]:hover::after{transform:translate(1px,-1px)}
.prose a[href$=".pdf" i]::after{content:"PDF" / "";margin-left:.35em;padding:.05em .35em;border:1px solid currentColor;border-radius:3px;font-size:.62em;font-weight:700;letter-spacing:.04em;vertical-align:.15em;display:inline-block;text-decoration:none}
.prose.wide{max-width:none;columns:auto}
.prose.center{margin-inline:auto;text-align:center}
.prose h2{font-size:var(--step-4);margin:1.6em 0 .55em}
.prose h3{font-size:var(--step-2);margin:1.5em 0 .5em}
.prose h4{font-size:var(--step-1);margin:1.4em 0 .4em}
.prose>:first-child{margin-top:0}
.prose ul,.prose ol{padding-left:1.25em;margin:0 0 1em}
.prose li{margin:.3em 0}
.prose li::marker{color:var(--accent)}
.prose blockquote{margin:1.5em 0;padding-left:1.25em;border-left:3px solid var(--accent);font-family:var(--font-display);font-size:var(--step-2);line-height:1.35}
.prose code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;background:var(--surface);padding:.1em .3em}
.text-head{font-size:var(--step-5);margin-bottom:var(--s-5)}
.text-block.center .text-head{text-align:center;margin-inline:auto}
.text-block.center{text-align:center}.text-block.center .prose{margin-inline:auto}

/* split */
.split{display:grid;gap:var(--s-7);align-items:center}
@media (min-width:52rem){.split{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.split.img-left .split-media{order:-1}.split.no-media{grid-template-columns:minmax(0,1fr)}}
.split.no-media>div{max-width:44rem}
.split-media img{width:100%;border-radius:var(--img-radius,0)}
.split h2{font-size:var(--step-5);margin:.4em 0 .5em}

/* figure */
figure{margin:0}
figcaption{margin-top:.75rem;font-size:var(--step-n1);color:var(--ink-2)}
.fig-content{max-width:var(--measure);margin-inline:auto}
.fig-full{width:100%}
.fig img{border-radius:var(--img-radius,0);width:100%}

/* gallery */
.gal-grid{display:grid;gap:var(--gal-gap,.75rem);grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.gal-grid img{aspect-ratio:1;object-fit:cover;width:100%}
.gal-mosaic{columns:3 14rem;column-gap:var(--gal-gap,.75rem)}
.gal-mosaic a{display:block;margin-bottom:var(--gal-gap,.75rem);break-inside:avoid}
.gal-strip{display:grid;grid-auto-flow:column;grid-auto-columns:min(78%,26rem);gap:var(--gal-gap,.75rem);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:.75rem;scrollbar-width:thin}
.gal-strip a{scroll-snap-align:start}.gal-strip img{aspect-ratio:4/5;object-fit:cover;width:100%}
.gal a{display:block;overflow:hidden;border-radius:var(--img-radius,0)}
.gal a img{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.gal a:hover img{transform:scale(1.03)}

/* consent embeds */
.consent{position:relative;aspect-ratio:16/9;background:var(--surface);display:grid;place-items:center;overflow:hidden;border:1px solid var(--line)}
.consent>picture,.consent>picture img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.consent-box{position:relative;max-width:30rem;margin:1rem;padding:1.25rem 1.5rem;background:var(--bg);color:var(--ink);font-size:var(--step-n1);display:grid;gap:.75rem;box-shadow:0 16px 40px -20px rgb(0 0 0/.4)}
.consent-box .btn{justify-self:start}
.consent-box label{display:flex;gap:.5rem;align-items:center}
.consent iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.consent.map{aspect-ratio:auto;min-height:24rem}
video.vid{width:100%;aspect-ratio:16/9;background:#000}

/* list */
.lst{list-style:none;margin:0;padding:0;counter-reset:n}
.lst-numbered li{counter-increment:n;display:grid;grid-template-columns:minmax(3.5rem,auto) 1fr;gap:1.5rem;padding:var(--s-5) 0;border-top:1px solid var(--line)}
.lst-numbered li::before{content:counter(n,decimal-leading-zero);font-family:var(--font-display);font-size:var(--step-3);line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}
.lst h3{font-size:var(--step-2);margin-bottom:.35rem}
.lst p{margin:0;color:var(--ink-2);max-width:44em}
.lst-rows li{display:grid;grid-template-columns:1fr auto;gap:.25rem 1.5rem;padding:var(--s-4) 0;border-top:1px solid var(--line)}
.lst-rows h3{font-size:var(--step-1)}
.lst-rows .meta{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;align-self:baseline}
.lst-rows p{grid-column:1/-1}
.lst-columns{display:grid;gap:var(--s-6) var(--s-7);grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))}
.lst-columns li{border-top:2px solid var(--ink);padding-top:var(--s-4)}
.lst-columns .meta{display:block;margin-top:.5rem;font-weight:600}

/* cta */
.cta{display:grid;gap:var(--s-5);align-items:end}
.cta h2{font-size:var(--step-6);max-width:18ch}
.cta p{font-size:var(--step-1);color:var(--ink-2);max-width:34em;margin:0}
@media (min-width:56rem){.cta{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}.cta .actions{justify-content:flex-end;margin:0}}

/* faq */
.faq{max-width:52rem}
.faq details{border-top:1px solid var(--line)}
.faq details:last-child{border-bottom:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:1rem;align-items:baseline;padding:1.15rem 0;font-family:var(--font-display);font-size:var(--step-2);line-height:1.3;font-weight:var(--display-weight)}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-family:var(--font-body);font-weight:400;font-size:1.5em;line-height:1;color:var(--accent);transition:transform .2s cubic-bezier(.2,.7,.2,1)}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq .ans{padding:0 0 1.25rem;max-width:var(--measure);color:var(--ink-2)}

/* quotes */
.tst{display:grid;gap:var(--s-7);grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))}
.tst blockquote,.qt blockquote{margin:0}
.tst blockquote p{font-family:var(--font-display);font-size:var(--step-3);line-height:1.3;letter-spacing:var(--display-tracking);margin-bottom:1.25rem}
.tst blockquote p::before{content:"«"}.tst blockquote p::after{content:"»"}
.tst footer,.qt footer{font-size:var(--step-n1)}
.tst footer strong,.qt footer strong{display:block;font-size:var(--step-0)}
.qt{max-width:56rem;margin-inline:auto;text-align:center}
.qt blockquote p{font-family:var(--font-display);font-size:var(--step-5);line-height:1.2;letter-spacing:var(--display-tracking);text-wrap:balance;margin-bottom:1.5rem}
.qt blockquote p::before{content:"«";color:var(--accent)}.qt blockquote p::after{content:"»";color:var(--accent)}

/* stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr));gap:var(--s-5)}
.stats div{border-left:1px solid var(--line);padding-left:1.25rem}
.stats strong{display:block;font-family:var(--font-display);font-size:var(--step-6);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);line-height:1;font-variant-numeric:lining-nums tabular-nums}
.stats span{display:block;margin-top:.5rem;color:var(--ink-2)}

/* pricing */
.plans{display:grid;gap:var(--s-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));align-items:start}
.plan{border-top:2px solid var(--line);padding-top:var(--s-5);display:grid;gap:.75rem}
.plan.hl{border-top:4px solid var(--accent)}
.plan h3{font-size:var(--step-2);display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
.plan .tag{font-family:var(--font-body);font-size:var(--step-n2);letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
.plan .price{font-family:var(--font-display);font-size:var(--step-5);line-height:1;letter-spacing:var(--display-tracking)}
.plan .per{color:var(--ink-2);font-size:var(--step-n1)}
.plan ul{list-style:none;margin:.25rem 0 0;padding:0;display:grid;gap:.4rem}
.plan li{padding-left:1.25rem;position:relative}.plan li::before{content:"–";position:absolute;left:0;color:var(--accent)}
.plan .btn{justify-self:start;margin-top:.5rem}

/* people */
.ppl{display:grid;gap:var(--s-6) var(--s-5);grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))}
.ppl img{aspect-ratio:3/4;object-fit:cover;width:100%;margin-bottom:1rem;border-radius:var(--img-radius,0)}
.ppl h3{font-size:var(--step-2)}
.ppl .role{color:var(--ink-2);font-size:var(--step-n1);margin:.2rem 0 .6rem}
.ppl p{font-size:var(--step-n1);margin:0}

/* logos */
.logos{display:flex;flex-wrap:wrap;gap:2rem 3.5rem;align-items:center}
.logos img{max-height:2.5rem;width:auto;filter:grayscale(1);opacity:.75;transition:opacity .2s,filter .2s}
.logos img:hover{filter:none;opacity:1}

/* divider */
.dv-line hr{border:0;border-top:1px solid var(--line);margin:0}
.dv-space{height:var(--sp-s)}
.dv-orn{text-align:center;color:var(--accent);font-size:var(--step-3);line-height:1}

/* forms */
.nform{display:grid;gap:1.25rem;max-width:40rem}
.nform fieldset{border:0;padding:0;margin:0;display:grid;gap:1.25rem}
.nform legend{font-family:var(--font-display);font-size:var(--step-2);margin-bottom:.5rem}
.fld{display:grid;gap:.4rem}
.fld label{font-weight:600;font-size:var(--step-n1)}
.fld .hint{font-size:var(--step-n1);color:var(--ink-2)}
.fld input,.fld select,.fld textarea{width:100%;min-height:2.9rem;padding:.65rem .8rem;background:var(--field-bg,transparent);border:1px solid var(--field-line,var(--ink-2));border-radius:var(--field-radius,2px);color:var(--ink)}
.fld textarea{min-height:8rem;max-height:28rem;resize:none;field-sizing:content;line-height:1.55}
/* text fields: own states instead of browser defaults (placeholder, autofill, caret, resize grip, search ×) */
input,textarea{caret-color:var(--accent)}
::placeholder{color:var(--ink-2);opacity:.8}
.fld input:not([type=checkbox],[type=radio]),.fld textarea,.search-form input{transition:border-color .15s,background-color .15s}
.fld input:not([type=checkbox],[type=radio],[type=file],:focus):hover,.fld textarea:not(:focus):hover,.search-form input:not(:focus):hover{border-color:var(--ink)}
input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus,textarea:-webkit-autofill{-webkit-text-fill-color:var(--ink);-webkit-box-shadow:0 0 0 100px color-mix(in srgb,var(--accent) 7%,var(--bg)) inset;caret-color:var(--accent);transition:background-color 600000s}
input:autofill{background:color-mix(in srgb,var(--accent) 7%,var(--bg))}
input[type=search]::-webkit-search-cancel-button,input[type=search]::-webkit-search-decoration{-webkit-appearance:none;appearance:none}
.fld [aria-invalid=true]:not([type=checkbox],[type=radio]),.search-form [aria-invalid=true]{border-color:#d0342c}
.ncount{justify-self:end;margin-top:-.15rem;font-size:var(--step-n2);color:var(--ink-2);font-variant-numeric:tabular-nums}
.ncount.near{color:var(--ink);font-weight:600}
.nclear{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);width:2rem;height:2rem;border:0;border-radius:50%;background:none;color:var(--ink-2);font-size:1.25rem;line-height:1;cursor:pointer}
.nclear:hover{color:var(--ink);background:color-mix(in srgb,var(--ink) 8%,transparent)}
.nsearch{position:relative;flex:1;display:flex}
.nsearch>input{padding-right:2.6rem!important}
.fld input:focus,.fld select:focus,.fld textarea:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.fld.check{grid-template-columns:auto 1fr;align-items:start;gap:.75rem}
.fld.check input{margin-top:.2rem}
.fld.check .nerr,.fld.check .hint{grid-column:1/-1}
.fld.check label{font-weight:400;font-size:var(--step-0)}
.fld select{appearance:none;padding-right:2.4rem;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 1.2rem) 55%,calc(100% - .85rem) 55%;background-size:.35rem .35rem;background-repeat:no-repeat}
input[type=number]{-moz-appearance:textfield;appearance:textfield}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.fld input[type=file]{padding:.45rem}
input[type=file]::file-selector-button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--ink);border-radius:var(--field-radius,2px);padding:.4rem .9rem;margin-right:.9rem;cursor:pointer}
input[type=checkbox],input[type=radio]{appearance:none;flex:none;display:inline-grid;place-content:center;width:1.25rem;height:1.25rem;min-height:0;margin:0;padding:0;border:1.5px solid var(--field-line,var(--ink-2));background:var(--field-bg,transparent);border-radius:calc(var(--field-radius,2px) * .6 + 2px);cursor:pointer;transition:background-color .15s,border-color .15s}
input[type=checkbox]{border-color:var(--ink-2)}
input[type=radio]{border-color:var(--ink-2);border-radius:50%}
input[type=checkbox]::before{content:"";width:.8rem;height:.8rem;background:var(--accent-ink);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4.5 10.5 3.5 3.5 7.5-8'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4.5 10.5 3.5 3.5 7.5-8'/%3E%3C/svg%3E") center/contain no-repeat;transform:scale(0);transition:transform .15s cubic-bezier(.2,.7,.2,1)}
input[type=radio]::before{content:"";width:.55rem;height:.55rem;border-radius:50%;background:var(--accent);transform:scale(0);transition:transform .15s cubic-bezier(.2,.7,.2,1)}
input[type=checkbox]:checked{background:var(--accent);border-color:var(--accent)}
input[type=radio]:checked{border-color:var(--accent)}
input[type=checkbox]:checked::before,input[type=radio]:checked::before{transform:none}
input[type=checkbox]:hover,input[type=radio]:hover{border-color:var(--ink)}
input[type=checkbox]:checked:hover{border-color:var(--accent)}
input[type=checkbox]:focus-visible,input[type=radio]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[type=checkbox]:disabled,input[type=radio]:disabled{opacity:.4;cursor:not-allowed}
/* own controls (fields.js): the native control stays underneath for the form */
.nw{position:relative}
.nn{position:absolute!important;inset:0;width:100%!important;height:100%!important;opacity:0;pointer-events:none}
.nsel{display:flex;align-items:center;gap:.75rem;width:100%;min-height:2.9rem;padding:.65rem .8rem;background:var(--field-bg,transparent);border:1px solid var(--field-line,var(--ink-2));border-radius:var(--field-radius,2px);color:var(--ink);text-align:left;cursor:pointer}
.nsel-v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nsel.ph .nsel-v{color:var(--ink-2)}
.nsel::after{content:"";flex:none;width:.45rem;height:.45rem;border-right:1.5px solid var(--ink-2);border-bottom:1.5px solid var(--ink-2);transform:translateY(-25%) rotate(45deg);transition:transform .18s cubic-bezier(.2,.7,.2,1)}
.nsel[aria-expanded=true]::after{transform:translateY(25%) rotate(225deg)}
.nsel:focus-visible,.nsel[aria-expanded=true]{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.npop{position:absolute;z-index:40;top:calc(100% + 6px);left:0;min-width:100%;max-height:18rem;overflow:auto;padding:.3rem;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:var(--field-radius,2px);box-shadow:0 18px 40px -16px rgb(0 0 0/.35);animation:npop .16s cubic-bezier(.2,.7,.2,1)}
.npop.up{top:auto;bottom:calc(100% + 6px)}
@keyframes npop{from{opacity:0;transform:translateY(-4px)}}
.nopt{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.55rem .7rem;border-radius:calc(var(--field-radius,2px) * .6);cursor:pointer}
.nopt.on{background:color-mix(in srgb,var(--ink) 8%,transparent)}
.nopt[aria-selected=true]{font-weight:600}
.nopt[aria-selected=true]::after{content:"";flex:none;width:.4rem;height:.75rem;border-right:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:translateY(-15%) rotate(45deg)}
.nopt[aria-disabled]{opacity:.4;cursor:not-allowed}
.nopt[hidden]{display:none}
.nw:has(>.ndate)::after{content:"";position:absolute;right:.85rem;top:50%;width:1.1rem;height:1.1rem;transform:translateY(-50%);background:var(--ink-2);pointer-events:none;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Crect x='3.25' y='4.25' width='13.5' height='12.5' rx='2'/%3E%3Cpath d='M3.25 8.25h13.5M7 2.75v3M13 2.75v3'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Crect x='3.25' y='4.25' width='13.5' height='12.5' rx='2'/%3E%3Cpath d='M3.25 8.25h13.5M7 2.75v3M13 2.75v3'/%3E%3C/svg%3E") center/contain no-repeat}
.fld .ndate{padding-right:2.6rem;font-variant-numeric:tabular-nums}
.ncal{width:19rem;min-width:0;padding:.75rem}
.ncal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}
.ncal-h strong{font-size:var(--step-0);font-weight:600}
.ncal-h button{width:2.25rem;height:2.25rem;border:0;border-radius:50%;background:none;color:var(--ink);font-size:1.4rem;line-height:1;cursor:pointer}
.ncal-h button:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}
.ncal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.ncal-g [role=columnheader]{font-size:var(--step-n2);font-weight:600;color:var(--ink-2);padding:.25rem 0}
.ncal-g button{aspect-ratio:1;border:0;border-radius:calc(var(--field-radius,2px) * .6 + 2px);background:none;color:var(--ink);font-size:var(--step-n1);font-variant-numeric:tabular-nums;cursor:pointer}
.ncal-g button:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}
.ncal-g button[data-out]{color:var(--ink-2)}
.ncal-g button[aria-current=date]{font-weight:700;box-shadow:inset 0 0 0 1px var(--line)}
.ncal-g button[aria-selected=true]{background:var(--accent);color:var(--accent-ink);font-weight:600}
.ncal-g button:disabled{opacity:.3;cursor:not-allowed;background:none}
.ncal-g button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.nstep{display:inline-flex;align-items:stretch;border:1px solid var(--field-line,var(--ink-2));border-radius:var(--field-radius,2px);background:var(--field-bg,transparent);overflow:hidden}
.nstep:focus-within{outline:2px solid var(--accent);border-color:var(--accent)}
.nstep>input[type]{width:3.25rem;min-height:2.6rem;padding:.4rem 0;border:0;border-radius:0;background:transparent;text-align:center;font-variant-numeric:tabular-nums;outline:0}
.nstep>button{flex:none;width:2.6rem;border:0;background:none;color:var(--ink);font-size:1.25rem;line-height:1;cursor:pointer}
.nstep>button:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}
.nfile{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .9rem;min-height:2.9rem;padding:.5rem;border:1px dashed var(--field-line,var(--ink-2));border-radius:var(--field-radius,2px);background:var(--field-bg,transparent);transition:border-color .15s,background-color .15s}
.nfile.drop{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.nfile-b{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--ink);border-radius:var(--field-radius,2px);padding:.4rem .9rem;cursor:pointer}
.nfile-b:hover{background:var(--ink);color:var(--bg)}
.nfile-n{color:var(--ink-2);font-size:var(--step-n1);min-width:0;overflow-wrap:anywhere}
.nfile.has .nfile-n{color:var(--ink)}
.nerr{font-size:var(--step-n1);font-weight:600;color:color-mix(in srgb,#d0342c 75%,var(--ink))}
.nw [aria-invalid=true],.nfile:has([aria-invalid=true]){border-color:#d0342c}
.req{color:var(--accent)}
.hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}
.form-ok{padding:1.25rem 1.5rem;border-left:4px solid var(--accent);background:var(--surface)}
.form-err{padding:1rem 1.25rem;border-left:4px solid #b3261e;background:color-mix(in srgb,#b3261e 8%,var(--bg));color:var(--ink)}
.steps-nav{display:flex;gap:1rem;align-items:center}
.js .nform[data-steps] fieldset:not(.on){display:none}
.form-grid{display:grid;gap:var(--s-7)}
@media (min-width:56rem){.form-grid{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}}

/* contact & hours */
.contact{display:grid;gap:var(--s-7);grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}
.contact address{font-style:normal;font-size:var(--step-1);line-height:1.5}
.contact address a{text-decoration:none}.contact address a:hover{text-decoration:underline}
.hours{width:100%;max-width:28rem;border-collapse:collapse;font-variant-numeric:tabular-nums}
.hours th,.hours td{text-align:left;padding:.5rem 0;border-bottom:1px solid var(--line);vertical-align:top}
.hours td{text-align:right}
.hours tr.today th,.hours tr.today td{font-weight:700}
.hours tr.today th::before{content:"";display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--accent);margin-right:.5rem;vertical-align:.1em}
.open-now{display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1rem;font-weight:600}
.open-now::before{content:"";width:.6rem;height:.6rem;border-radius:50%;background:var(--status,#2f7d4f)}
.open-now.closed{--status:#9a3b2b}

/* collection teasers */
.posts-list{list-style:none;margin:0;padding:0}
.posts-list li{display:grid;grid-template-columns:7.5rem 1fr;gap:.25rem 1.5rem;padding:var(--s-4) 0;border-top:1px solid var(--line)}
.posts-list time{font-size:var(--step-n1);color:var(--ink-2);font-variant-numeric:tabular-nums;padding-top:.35em}
.posts-list h3{font-size:var(--step-3)}
.posts-list a{text-decoration:none}.posts-list a:hover h3{text-decoration:underline;text-decoration-color:var(--accent)}
.posts-list p{margin:.4rem 0 0;color:var(--ink-2)}
@media (max-width:36rem){.posts-list li{grid-template-columns:1fr}}
.cards{display:grid;gap:var(--s-6) var(--s-5);grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))}
.card{display:grid;gap:.6rem;align-content:start;text-decoration:none}
.card img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:var(--img-radius,0);transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.card .ph{overflow:hidden;border-radius:var(--img-radius,0)}
.ph-empty{display:grid;place-items:center;aspect-ratio:var(--ph-ratio,3/2);background:var(--surface);color:var(--ink-2);font-family:var(--font-display);font-size:var(--step-6);line-height:1;border:1px solid var(--line)}
.products .ph-empty{--ph-ratio:4/5}.proj .ph-empty{--ph-ratio:4/3}
.card:hover img{transform:scale(1.03)}
.card h3{font-size:var(--step-2)}
.card:hover h3{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:.2em}
.card p{margin:0;color:var(--ink-2);font-size:var(--step-n1)}
.cards.feature>:first-child{grid-column:1/-1}
@media (min-width:56rem){.cards.feature>:first-child{grid-template-columns:3fr 2fr;gap:2rem;align-items:center}.cards.feature>:first-child h3{font-size:var(--step-5)}}
.products .card img{aspect-ratio:4/5}
.price-row{display:flex;gap:.6rem;align-items:baseline;font-variant-numeric:tabular-nums}
.price-row s{color:var(--ink-2);font-size:.9em}
.badge{display:inline-block;font-size:var(--step-n2);text-transform:uppercase;letter-spacing:.08em;font-weight:700;padding:.2rem .45rem;border:1px solid currentColor}
.filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:var(--s-6)}
.filters a{text-decoration:none;padding:.4rem .9rem;border:1px solid var(--line);border-radius:var(--chip-radius,2rem);font-size:var(--step-n1)}
.filters a[aria-current=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.pager{display:flex;justify-content:space-between;gap:1rem;margin-top:var(--s-7);padding-top:var(--s-4);border-top:1px solid var(--line)}

/* menu */
.mn-cat{margin-top:var(--s-7)}
.mn-cat:first-child{margin-top:0}
.mn-cat>h3{font-size:var(--step-4);margin-bottom:var(--s-4);padding-bottom:.6rem;border-bottom:1px solid var(--ink)}
.mn-items{list-style:none;margin:0;padding:0;display:grid;gap:var(--s-4) var(--s-7)}
@media (min-width:60rem){.mn-items.two{grid-template-columns:1fr 1fr}}
.dish{display:grid;gap:.15rem}
.dish-head{display:flex;align-items:baseline;gap:.5rem}
.dish-name{font-weight:700;font-size:var(--step-1)}
.dish-lead{flex:1;border-bottom:1px dotted var(--ink-2);transform:translateY(-.3em);min-width:1rem}
.dish-price{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}
.dish-price small{font-weight:400;color:var(--ink-2)}
.dish p{margin:0;color:var(--ink-2);max-width:40em}
.dish .marks{font-size:var(--step-n2);color:var(--ink-2);letter-spacing:.04em}
.dish .marks b{color:var(--accent);font-weight:700}
.dish.out .dish-name,.dish.out .dish-price{text-decoration:line-through;color:var(--ink-2)}
.daily{border:1px solid var(--ink);padding:var(--s-5);margin-bottom:var(--s-7)}
.daily h3{font-size:var(--step-3);margin-bottom:.25rem}
.mn-legend{margin-top:var(--s-7);font-size:var(--step-n1);color:var(--ink-2);display:grid;gap:.5rem;max-width:52rem}

/* projects */
.proj{display:grid;gap:var(--s-7) var(--s-5);grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))}
.proj .card img{aspect-ratio:4/3}
.proj .meta{display:flex;justify-content:space-between;gap:1rem;font-size:var(--step-n1);color:var(--ink-2)}

/* profiles */
.prof{display:grid;gap:var(--s-5);grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.prof .card img{aspect-ratio:3/4}
.avail{display:inline-flex;align-items:center;gap:.4rem;font-size:var(--step-n1);font-weight:600}
.avail::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:#2f7d4f}

/* article */
.art-head{padding-top:var(--sp-s);display:grid;gap:var(--s-4)}
.art-head h1{font-size:var(--step-7);max-width:18ch}
.art-meta{display:flex;flex-wrap:wrap;gap:.35rem 1rem;color:var(--ink-2);font-size:var(--step-n1)}
.art-meta>*+*::before{content:"·";margin-right:1rem;color:var(--line)}
.art-cover{margin-top:var(--s-6)}
.art-cover img{width:100%;max-height:44rem;object-fit:cover}
.art-foot{border-top:1px solid var(--line);margin-top:var(--s-6);padding-top:var(--s-5);display:flex;flex-wrap:wrap;gap:.5rem}
.tag-chip{font-size:var(--step-n1);padding:.25rem .7rem;border:1px solid var(--line);border-radius:var(--chip-radius,2rem);text-decoration:none}
.series{border:1px solid var(--line);padding:var(--s-4) var(--s-5);margin-top:var(--s-6)}
.series ol{margin:.5rem 0 0;padding-left:1.25rem}
.comments{max-width:var(--measure)}
.comment{padding:var(--s-4) 0;border-top:1px solid var(--line)}
.comment header{display:flex;gap:1rem;align-items:baseline;margin-bottom:.4rem}
.comment time{font-size:var(--step-n1);color:var(--ink-2)}

/* product */
.pdp{display:grid;gap:var(--s-7);padding-top:var(--s-6)}
@media (min-width:56rem){.pdp{grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:start}.pdp-info{position:sticky;top:6rem}}
.pdp-gal{display:grid;gap:.75rem}
.pdp-gal img{width:100%;aspect-ratio:4/5;object-fit:cover}
.pdp-gal .thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem}
.pdp-gal .thumbs img{aspect-ratio:1}
.pdp-info{display:grid;gap:1.25rem;align-content:start}
.pdp-info h1{font-size:var(--step-5)}
.pdp-price{font-size:var(--step-3);font-family:var(--font-display)}
.pdp-note{font-size:var(--step-n1);color:var(--ink-2)}
.qty{display:flex;gap:.75rem;align-items:end;flex-wrap:wrap}
.qty .fld{width:6rem}.qty .fld:has(.nstep){width:auto}
.stock{font-size:var(--step-n1);font-weight:600}
.stock.low{color:#9a3b2b}

/* cart & checkout */
.cart-table{width:100%;border-collapse:collapse}
.cart-table td,.cart-table th{padding:1rem .5rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.cart-table th{font-size:var(--step-n1);color:var(--ink-2);font-weight:600}
.cart-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cart-table input{width:4.5rem;min-height:2.5rem;padding:.4rem;border:1px solid var(--ink-2);background:transparent}
.cart-table img{width:4rem;aspect-ratio:1;object-fit:cover}
.totals{margin-left:auto;max-width:24rem;display:grid;gap:.4rem;font-variant-numeric:tabular-nums;margin-top:var(--s-5)}
.totals div{display:flex;justify-content:space-between;gap:2rem}
.totals .grand{font-size:var(--step-2);font-weight:700;border-top:1px solid var(--ink);padding-top:.6rem;margin-top:.35rem}
.checkout{display:grid;gap:var(--s-7)}
@media (min-width:56rem){.checkout{grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}.checkout aside{position:sticky;top:6rem}}
.checkout aside{background:var(--surface);padding:var(--s-5)}
.pay-opts{display:grid;gap:.5rem}
.pay-opt{display:flex;gap:.75rem;align-items:center;padding:.9rem 1rem;border:1px solid var(--line);cursor:pointer}
.pay-opt:has(input:checked){border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.two-col{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))}

/* age gate */
.age{position:fixed;inset:0;z-index:1000;background:var(--bg);display:grid;place-items:center;padding:var(--gutter)}
.age-box{max-width:30rem;text-align:center;display:grid;gap:1.25rem;justify-items:center}
.age-box h1{font-size:var(--step-5)}
.age-box .actions{justify-content:center}
body.age-locked{overflow:hidden}

/* lightbox */
.lb{position:fixed;inset:0;z-index:900;background:rgb(10 10 10/.92);display:grid;place-items:center;padding:2rem;opacity:0;transition:opacity .2s}
.lb.on{opacity:1}
.lb img{max-height:88vh;width:auto;max-width:100%;transform:scale(.97);transition:transform .25s cubic-bezier(.2,.7,.2,1)}
.lb.on img{transform:none}
.lb button{position:absolute;background:none;border:0;color:#fff;font-size:2rem;cursor:pointer;min-width:3rem;min-height:3rem}
.lb .x{top:1rem;right:1rem}.lb .prev{left:.5rem;top:50%}.lb .next{right:.5rem;top:50%}

/* search, 404 */
.search-form{display:flex;gap:.5rem;max-width:36rem}
.search-form input{flex:1;width:100%;min-height:2.9rem;padding:.6rem .8rem;border:1px solid var(--field-line,var(--ink-2));border-radius:var(--field-radius,2px);background:var(--field-bg,transparent);color:var(--ink)}
.search-form input:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.results{list-style:none;padding:0;margin:var(--s-6) 0 0}
.results li{padding:var(--s-4) 0;border-top:1px solid var(--line)}
.results a{font-family:var(--font-display);font-size:var(--step-2);text-decoration:none}
.nf{min-height:50vh;display:grid;align-content:center;gap:var(--s-5)}
.nf .code{font-family:var(--font-display);font-size:var(--step-8);line-height:.9;color:var(--accent)}

/* edit-mode helpers */
.nova-empty{display:grid;place-items:center;min-height:10rem;border:1px dashed var(--line);color:var(--ink-2);font-size:var(--step-n1);text-align:center;padding:1rem}
.html-block :where(img){max-width:100%}

@media print{.site-header,.site-footer,.actions,.filters,.no-print{display:none!important}body{background:#fff;color:#000}.b{padding-block:1rem}}
`;

/* ---------- Themes ---------- */

const KANTE_CSS = `
:root{--display-weight:600;--display-tracking:-.035em;--display-leading:.98;--hero-size:var(--step-8);--hero-measure:13ch;--btn-radius:2px;--header-rule:var(--line);--label-tracking:.1em;--brand-weight:700;--brand-size:var(--step-1);--nav-size:var(--step-n1);--nav-weight:600;--chip-radius:2px;--measure:36rem}
.label{font-variant-numeric:tabular-nums}
.bh{grid-template-columns:1fr;border-top:1px solid var(--ink);padding-top:1rem}
@media (min-width:56rem){.bh{grid-template-columns:minmax(0,4fr) minmax(0,8fr);align-items:start}.bh p{grid-column:2}.bh h2{grid-column:1/-1}}
.bh .num{font-size:var(--step-n1);font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;letter-spacing:.06em}
.hero h1,.hero .h{text-transform:none}
.hero .eyebrow{display:flex;gap:1rem;align-items:center}
.hero .eyebrow::before{content:"";width:2.5rem;border-top:2px solid var(--accent)}
.hero-statement{border-bottom:1px solid var(--line)}
.text-head{font-size:var(--step-4)}
.cta h2{font-size:var(--step-7);letter-spacing:-.04em}
.stats div{border-left:2px solid var(--ink)}
.faq summary{font-family:var(--font-body);font-size:var(--step-1);font-weight:600;letter-spacing:-.01em}
.tst blockquote p{font-weight:500}
.dish-lead{border-bottom-style:solid;border-bottom-color:var(--line)}
.mn-cat>h3{font-size:var(--step-n1);font-family:var(--font-body);text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--accent);border-color:var(--line)}
.btn{--btn-tracking:-.005em}
`;

const BISTRO_CSS = `
:root{--display-weight:480;--display-tracking:-.015em;--display-leading:1.05;--display-axes:"SOFT" 100,"WONK" 0;--btn-radius:999px;--btn-pad:.75em 1.5em;--img-radius:3px;--label-case:none;--label-tracking:0;--label-weight:500;--brand-size:var(--step-2);--brand-weight:600;--field-radius:6px;--field-bg:color-mix(in srgb,var(--surface) 60%,transparent);--field-line:var(--line);--hero-measure:15ch}
.label{font-family:var(--font-display);font-style:italic;font-size:var(--step-1);color:var(--accent)}
h1 em,h2 em,.hero .h em{font-style:italic;color:var(--accent)}
.bh{justify-items:start}
.bh h2{font-size:var(--step-5)}
.hero-statement{text-align:center}.hero-statement .h,.hero-statement .lead{margin-inline:auto}.hero-statement .actions{justify-content:center}
.hero-statement .h{--hero-size:var(--step-8);max-width:14ch}
.cta{text-align:center;grid-template-columns:1fr!important;justify-items:center}.cta h2{margin-inline:auto}.cta .actions{justify-content:center!important}
.site-header{--header-rule:transparent}
.hdr{min-height:5rem}
.mn-cat>h3{font-style:italic;border-bottom:0;text-align:center;font-size:var(--step-5);color:var(--ink)}
.mn-cat>h3::after{content:"";display:block;width:3rem;margin:.75rem auto 0;border-top:1px solid var(--accent)}
.daily{border:0;background:var(--surface);border-radius:4px}
.lst-numbered li::before{font-style:italic}
.faq summary{font-weight:500}
.qt blockquote p{font-style:italic}
.tst blockquote p{font-style:italic}
.stats div{border-left:0;padding-left:0;text-align:center}
.stats strong{color:var(--accent)}
.plan{border:1px solid var(--line);border-radius:6px;padding:var(--s-5)}.plan.hl{border:2px solid var(--accent)}
`;

const SALON_CSS = `
:root{--scheme:dark;--display-weight:500;--display-tracking:-.01em;--display-leading:1.02;--btn-radius:0;--btn-bg:transparent;--btn-ink:var(--accent);--btn-border:1px solid var(--accent);--btn-case:uppercase;--btn-tracking:.16em;--btn-size:var(--step-n1);--btn-pad:1em 1.8em;--label-tracking:.24em;--label-weight:500;--nav-size:var(--step-n1);--brand-size:var(--step-2);--brand-weight:500;--header-rule:var(--line);--field-line:var(--line);--hero-measure:14ch}
.btn:hover{background:var(--accent);color:var(--bg)}
.tone-accent{--btn-bg:transparent;--btn-ink:var(--accent-ink);--btn-border:1px solid var(--accent-ink)}
.nav a{text-transform:uppercase;letter-spacing:.18em}
.label{color:var(--accent)}
h1,h2,.hero .h{font-style:italic}
.hero-statement{text-align:center}.hero-statement .h,.hero-statement .lead{margin-inline:auto}.hero-statement .actions{justify-content:center}
.hero-statement .eyebrow{display:flex;gap:1rem;align-items:center;justify-content:center}
.hero-statement .eyebrow::before,.hero-statement .eyebrow::after{content:"";width:2rem;border-top:1px solid var(--accent)}
.bh{justify-items:center;text-align:center}.bh p{margin-inline:auto}
.bh h2::after{content:"";display:block;width:2.5rem;margin:1rem auto 0;border-top:1px solid var(--accent)}
.cta{text-align:center;grid-template-columns:1fr!important;justify-items:center}.cta .actions{justify-content:center!important}
.mn-cat>h3{text-align:center;border-bottom:0;font-size:var(--step-4)}
.dish-lead{border-bottom-color:var(--line)}
.dish-name{font-weight:500;letter-spacing:.02em}
.lst-numbered li::before{color:var(--accent);font-style:italic}
.faq summary{font-style:italic}
.stats div{border-left-color:var(--accent)}
.plan{border-top-color:var(--accent)}
.card h3{font-style:italic}
.site-footer{border-top-color:var(--line)}
`;

const FEUILLETON_CSS = `
:root{--display-weight:500;--display-tracking:-.02em;--display-leading:1.04;--font-label:var(--font-body);--label-case:uppercase;--label-tracking:.14em;--label-weight:600;--btn-radius:0;--btn-weight:500;--brand-size:var(--step-5);--brand-weight:600;--measure:34rem;--hero-measure:18ch;--nav-size:var(--step-n1)}
body{font-size:calc(var(--step-0)*1.06);line-height:1.62}
.hdr{flex-direction:column;justify-content:center;padding:1.5rem 0 .75rem;gap:.85rem}
.hdr .brand{font-size:var(--brand-size);letter-spacing:-.03em}
.site-header{border-bottom:3px double var(--ink)}
.nav ul{gap:1.5rem}
.nav a{text-transform:uppercase;letter-spacing:.14em;font-weight:600}
@media (max-width:52rem){.hdr{flex-direction:row;justify-content:space-between;padding:.75rem 0}.hdr .brand{font-size:var(--step-3)}}
.bh{border-top:1px solid var(--ink);padding-top:.75rem}
.bh h2{font-size:var(--step-4)}
.hero-statement .h{font-size:var(--step-7)}
.art-body>.b:first-child .prose>p:first-of-type::first-letter{float:left;font-family:var(--font-display);font-size:4.4em;line-height:.82;padding:.08em .1em 0 0;color:var(--accent);font-weight:600}
.posts-list h3{font-size:var(--step-3);font-weight:500}
.posts-list li{grid-template-columns:9rem 1fr}
.prose blockquote{font-style:italic;border-left-width:2px}
.qt blockquote p{font-style:italic}
.tst blockquote p{font-style:italic;font-size:var(--step-2)}
.mn-cat>h3{font-variant:small-caps;letter-spacing:.06em}
.faq summary{font-size:var(--step-2)}
`;

const p = (o: Palette) => o;

export const THEMES: Theme[] = [
  {
    id: 'kante',
    name: 'Kante',
    description: 'Klares Raster, nummerierte Abschnitte, eine Signalfarbe. Für Shops, KMU und Agenturen.',
    pair: 'kante',
    header: 'bar',
    ornament: '—',
    numbered: true,
    css: KANTE_CSS,
    palettes: [
      p({ id: 'default', label: 'Zinnober', bg: '#f6f5f1', surface: '#ebe8e1', ink: '#121211', ink2: '#575650', line: '#d6d3ca', accent: '#c4381b', accentInk: '#ffffff', invBg: '#121211', invInk: '#f6f5f1', invInk2: '#b4b2aa', invLine: '#3a3936' }),
      p({ id: 'kobalt', label: 'Kobalt', bg: '#f5f6f8', surface: '#e7e9ee', ink: '#0f1115', ink2: '#53565e', line: '#d3d6dd', accent: '#2443c9', accentInk: '#ffffff', invBg: '#0f1115', invInk: '#f5f6f8', invInk2: '#aeb2bc', invLine: '#343842' }),
      p({ id: 'nacht', label: 'Nacht', dark: true, bg: '#111110', surface: '#1c1b19', ink: '#f0eee8', ink2: '#a9a69d', line: '#33322e', accent: '#ff6a3d', accentInk: '#111110', invBg: '#f0eee8', invInk: '#111110', invInk2: '#57554f', invLine: '#d1cfc7' }),
    ],
  },
  {
    id: 'bistro',
    name: 'Bistro',
    description: 'Warmes Papier, weiche Serifen, Punktlinien wie auf einer gedruckten Karte. Für Gastronomie und Handwerk.',
    pair: 'bistro',
    header: 'bar',
    ornament: '❦',
    numbered: false,
    css: BISTRO_CSS,
    palettes: [
      p({ id: 'default', label: 'Terrakotta', bg: '#f4ede1', surface: '#ebe0cd', ink: '#2b2119', ink2: '#685849', line: '#d7c8b1', accent: '#a8401f', accentInk: '#fff8ef', invBg: '#2b2119', invInk: '#f4ede1', invInk2: '#c3b39e', invLine: '#4a3d31' }),
      p({ id: 'olive', label: 'Olive', bg: '#f2efe4', surface: '#e5e1cf', ink: '#24241b', ink2: '#5e5d4c', line: '#d2ceb9', accent: '#55622c', accentInk: '#fbfaf3', invBg: '#24241b', invInk: '#f2efe4', invInk2: '#bdbba5', invLine: '#45453a' }),
      p({ id: 'pflaume', label: 'Pflaume', bg: '#f5eeea', surface: '#ebdfd9', ink: '#2a1b20', ink2: '#6a5359', line: '#dac8c6', accent: '#7a2c4b', accentInk: '#fff6f6', invBg: '#2a1b20', invInk: '#f5eeea', invInk2: '#c7b2b6', invLine: '#4b3238' }),
    ],
  },
  {
    id: 'salon',
    name: 'Salon',
    description: 'Dunkel, kontrastreiche Didone, Messinglinien. Für Fine Dining, Bars, Hotels und Studios.',
    pair: 'salon',
    header: 'bar',
    ornament: '◆',
    numbered: false,
    css: SALON_CSS,
    palettes: [
      p({ id: 'default', label: 'Messing', dark: true, bg: '#14110e', surface: '#1f1a16', ink: '#efe7da', ink2: '#a99d8b', line: '#3a3029', accent: '#c9a46a', accentInk: '#14110e', invBg: '#efe7da', invInk: '#14110e', invInk2: '#5d5346', invLine: '#cfc3b0' }),
      p({ id: 'bordeaux', label: 'Bordeaux', dark: true, bg: '#160d10', surface: '#22151a', ink: '#f1e4e2', ink2: '#ad9a99', line: '#3d272d', accent: '#d48a8f', accentInk: '#160d10', invBg: '#f1e4e2', invInk: '#160d10', invInk2: '#5e4a4c', invLine: '#d2bdbb' }),
      p({ id: 'creme', label: 'Crème', bg: '#f3eee6', surface: '#e9e2d6', ink: '#1a1612', ink2: '#5f564b', line: '#d5ccbd', accent: '#795a27', accentInk: '#fffaf0', invBg: '#1a1612', invInk: '#f3eee6', invInk2: '#b9ae9e', invLine: '#3a332b' }),
    ],
  },
  {
    id: 'feuilleton',
    name: 'Feuilleton',
    description: 'Zeitungskopf, Initialen, ruhige Lesetypografie. Für Blogs, Magazine, Praxen und Vereine.',
    pair: 'feuilleton',
    header: 'masthead',
    ornament: '⁂',
    numbered: false,
    css: FEUILLETON_CSS,
    palettes: [
      p({ id: 'default', label: 'Tanne', bg: '#fbfaf6', surface: '#f1eee6', ink: '#1a1a17', ink2: '#5a5852', line: '#e0ddd3', accent: '#1d5a44', accentInk: '#f7fbf8', invBg: '#1a1a17', invInk: '#fbfaf6', invInk2: '#b7b5ad', invLine: '#3b3a35' }),
      p({ id: 'tinte', label: 'Tinte', bg: '#f9f8f4', surface: '#eeece5', ink: '#16181f', ink2: '#575a63', line: '#dddcd5', accent: '#233a7a', accentInk: '#f6f8ff', invBg: '#16181f', invInk: '#f9f8f4', invInk2: '#b3b5bd', invLine: '#383b45' }),
      p({ id: 'ziegel', label: 'Ziegel', bg: '#fbf8f3', surface: '#f2ebe1', ink: '#1d1915', ink2: '#5e554c', line: '#e2d9cc', accent: '#9c3a22', accentInk: '#fff8f2', invBg: '#1d1915', invInk: '#fbf8f3', invInk2: '#bbb0a3', invLine: '#3d352e' }),
    ],
  },
];

export const THEME_MAP: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export function resolveTheme(settings: SiteSettings): { theme: Theme; palette: Palette } {
  const theme = THEME_MAP[settings.theme.id] ?? THEMES[0];
  const palette = theme.palettes.find((x) => x.id === settings.theme.palette) ?? theme.palettes[0];
  return { theme, palette };
}

/** Werkbank token values are free text; keep them from closing the style element. */
const cssValue = (v: string) => v.replace(/[<>{};]/g, '');

export function themeCss(settings: SiteSettings): { css: string; fonts: string[] } {
  const { theme, palette } = resolveTheme(settings);
  const pair = FONT_PAIRS.find((f) => f.id === settings.theme.fontPair) ?? FONT_PAIRS.find((f) => f.id === theme.pair)!;
  const rhythm = Math.min(1.4, Math.max(0.7, settings.theme.spacing || 1));
  const tokens: Record<string, string> = {
    '--bg': palette.bg,
    '--surface': palette.surface,
    '--ink': palette.ink,
    '--ink-2': palette.ink2,
    '--line': palette.line,
    '--accent': palette.accent,
    '--accent-ink': palette.accentInk,
    '--inv-bg': palette.invBg,
    '--inv-ink': palette.invInk,
    '--inv-ink2': palette.invInk2,
    '--inv-line': palette.invLine,
    '--font-display': FONTS[pair.display].stack,
    '--font-body': FONTS[pair.body].stack,
    '--gutter': 'clamp(1rem, 4vw, 3rem)',
    '--max': '78rem',
    '--measure': '38rem',
    '--img-radius': `${Math.max(0, Math.min(24, settings.theme.radius ?? 0))}px`,
    '--s-1': '.25rem',
    '--s-2': '.5rem',
    '--s-3': '.75rem',
    '--s-4': '1rem',
    '--s-5': '1.5rem',
    '--s-6': '2.25rem',
    '--s-7': 'clamp(2.5rem, 5vw, 3.75rem)',
    '--sp-s': `calc(clamp(2rem, 4vw, 3rem) * ${rhythm})`,
    '--sp-m': `calc(clamp(3.25rem, 7vw, 6.5rem) * ${rhythm})`,
    '--sp-l': `calc(clamp(4.5rem, 11vw, 10rem) * ${rhythm})`,
  };
  if (palette.dark) tokens['--scheme'] = 'dark';
  const overrides = Object.entries(settings.theme.tokens ?? {})
    .filter(([k]) => /^--[a-z0-9-]+$/.test(k))
    .map(([k, v]) => `${k}:${cssValue(String(v))}`)
    .join(';');
  const root = `:root{${SCALE};${Object.entries(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
  const custom = (settings.theme.css ?? '').replace(/<\/?style/gi, '');
  const css = [fontFaces([pair.display, pair.body]), root, BASE, theme.css, overrides ? `:root{${overrides}}` : '', custom].join('\n');
  return { css: minify(css), fonts: [pair.display, pair.body] };
}

function minify(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n+/g, '')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}');
}
