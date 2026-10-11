/**
 * The website's social profiles as icons: which network a link points to,
 * and a simple line drawing of it in the style of the site's icons (20 × 20,
 * stroked in the current colour). Unknown sites get a globe.
 */

export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'linkedin', 'youtube', 'x', 'tiktok', 'whatsapp', 'mail', 'web'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

const NAMES: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  x: 'X',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  mail: 'E-Mail',
  web: 'Website',
};

const HOSTS: [RegExp, SocialNetwork][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
];

/** The network a profile link points to. */
export function networkOf(href: string): { id: SocialNetwork; name: string } {
  if (/^mailto:/i.test(href)) return { id: 'mail', name: NAMES.mail };
  let host = '';
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    /* not a full address */
  }
  const id = HOSTS.find(([re]) => re.test(host))?.[1] ?? 'web';
  return { id, name: NAMES[id] };
}

const SVG: Record<SocialNetwork, string> = {
  instagram: '<rect x="3" y="3" width="14" height="14" rx="4"/><circle cx="10" cy="10" r="3.25"/><circle cx="14.1" cy="5.9" r=".6" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M12.75 3.25h-1.5A2.75 2.75 0 0 0 8.5 6v11M5.75 9.25h6"/>',
  linkedin: '<rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M6.75 9v5M6.75 6.25v.01M9.75 14V9M9.75 11.25c0-1.25.9-2.25 2.1-2.25S14 10 14 11.25V14"/>',
  youtube: '<rect x="2.5" y="5" width="15" height="10" rx="3.5"/><path d="M8.75 7.75v4.5l3.75-2.25z"/>',
  x: '<path d="M4.25 3.75h3.5l8 12.5h-3.5zM15.5 3.75 10.9 8.9M4.5 16.25l4.6-5.15"/>',
  tiktok: '<path d="M11 3v9.75a2.75 2.75 0 1 1-2.75-2.75M11 3c.35 2.15 1.9 3.6 4 3.75"/>',
  whatsapp:
    '<path d="M10 3.25a6.75 6.75 0 0 0-5.85 10.1L3.25 16.75l3.5-.85A6.75 6.75 0 1 0 10 3.25z"/><path d="M7.75 7.5c0 2.6 2.15 4.75 4.75 4.75l.75-1.25-1.5-.75-.75.75a3.3 3.3 0 0 1-2-2l.75-.75-.75-1.5z"/>',
  mail: '<rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5"/><path d="M3.25 5 10 10.75 16.75 5"/>',
  web: '<circle cx="10" cy="10" r="7.25"/><path d="M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25c-2-2.1-3-4.5-3-7.25s1-5.15 3-7.25z"/>',
};

/** The line drawing of a network – fixed markup, never user input. */
export const socialSvg = (id: SocialNetwork, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SVG[id]}</svg>`;
