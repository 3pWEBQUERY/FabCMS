import { createBlock } from '../../shared/blocks';
import type { Block } from '../../shared/types';

/** Starting points for new pages – small, honest, meant to be rewritten. */
export interface PagePreset {
  id: string;
  label: string;
  description: string;
  blocks: () => Block[];
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'blank', label: 'Leer', description: 'Nur ein Titel. Du baust den Rest.', blocks: () => [createBlock('hero', { title: 'Neue Seite', text: '', primary: null })] },
  {
    id: 'about',
    label: 'Über uns',
    description: 'Einstieg, Geschichte mit Bild, Team.',
    blocks: () => [
      createBlock('hero', { eyebrow: 'Über uns', title: 'Wer hinter allem steckt', text: 'Zwei, drei Sätze darüber, was euch antreibt.', primary: null }),
      createBlock('split', { heading: 'Wie alles anfing', body: '<p>Erzähl die Geschichte: wann, wo, warum.</p>' }),
      createBlock('people', { heading: 'Team', items: [{ name: 'Vorname Name', role: 'Funktion', text: '', image: null }] }),
    ],
  },
  {
    id: 'services',
    label: 'Leistungen',
    description: 'Angebot als Liste mit Preisen, Aufruf am Schluss.',
    blocks: () => [
      createBlock('hero', { eyebrow: 'Angebot', title: 'Was wir für dich tun', text: '', primary: null }),
      createBlock('list', {
        heading: 'Leistungen',
        style: 'rows',
        items: [
          { title: 'Leistung eins', text: 'Kurz beschrieben.', meta: 'ab 90.–' },
          { title: 'Leistung zwei', text: 'Kurz beschrieben.', meta: 'ab 140.–' },
        ],
      }),
      createBlock('cta', { heading: 'Passt etwas davon?', primary: { label: 'Anfragen', href: '/kontakt' } }),
    ],
  },
  {
    id: 'contact',
    label: 'Kontakt',
    description: 'Adresse, Öffnungszeiten, Formular, Karte.',
    blocks: () => [createBlock('contact', { heading: 'Kontakt' }), createBlock('form', { heading: 'Schreib uns' }), createBlock('map')],
  },
  {
    id: 'faq',
    label: 'Häufige Fragen',
    description: 'Fragen und Antworten – Google zeigt sie oft direkt an.',
    blocks: () => [createBlock('hero', { title: 'Häufige Fragen', text: '', primary: null }), createBlock('faq', { heading: '' })],
  },
];
