import { createBlock } from '../../shared/blocks';
import { t } from './i18n';
import type { Block } from '../../shared/types';

/** Starting points for new pages – small, honest, meant to be rewritten. */
export interface PagePreset {
  id: string;
  label: string;
  description: string;
  blocks: () => Block[];
}

// Name, description and starter text in the interface language: getters and functions run
// at display / creation time, after the language is loaded.
export const PAGE_PRESETS: PagePreset[] = [
  {
    id: 'blank',
    get label() {
      return t('Leer');
    },
    get description() {
      return t('Nur ein Titel. Du baust den Rest.');
    },
    blocks: () => [createBlock('hero', { title: t('Neue Seite'), text: '', primary: null })],
  },
  {
    id: 'about',
    get label() {
      return t('Über uns');
    },
    get description() {
      return t('Einstieg, Geschichte mit Bild, Team.');
    },
    blocks: () => [
      createBlock('hero', { eyebrow: t('Über uns'), title: t('Wer hinter allem steckt'), text: t('Zwei, drei Sätze darüber, was euch antreibt.'), primary: null }),
      createBlock('split', { heading: t('Wie alles anfing'), body: `<p>${t('Erzähl die Geschichte: wann, wo, warum.')}</p>` }),
      createBlock('people', { heading: t('Team'), items: [{ name: t('Vorname Name'), role: t('Funktion'), text: '', image: null }] }),
    ],
  },
  {
    id: 'services',
    get label() {
      return t('Leistungen');
    },
    get description() {
      return t('Angebot als Liste mit Preisen, Aufruf am Schluss.');
    },
    blocks: () => [
      createBlock('hero', { eyebrow: t('Angebot'), title: t('Was wir für dich tun'), text: '', primary: null }),
      createBlock('list', {
        heading: t('Leistungen'),
        style: 'rows',
        items: [
          { title: t('Leistung eins'), text: t('Kurz beschrieben.'), meta: t('ab {price}', { price: '90.–' }) },
          { title: t('Leistung zwei'), text: t('Kurz beschrieben.'), meta: t('ab {price}', { price: '140.–' }) },
        ],
      }),
      createBlock('cta', { heading: t('Passt etwas davon?'), primary: { label: t('Anfragen'), href: '/kontakt' } }),
    ],
  },
  {
    id: 'contact',
    get label() {
      return t('Kontakt');
    },
    get description() {
      return t('Adresse, Öffnungszeiten, Formular, Karte.');
    },
    blocks: () => [createBlock('contact', { heading: t('Kontakt') }), createBlock('form', { heading: t('Schreib uns') }), createBlock('map')],
  },
  {
    id: 'faq',
    get label() {
      return t('Häufige Fragen');
    },
    get description() {
      return t('Fragen und Antworten – Google zeigt sie oft direkt an.');
    },
    blocks: () => [createBlock('hero', { title: t('Häufige Fragen'), text: '', primary: null }), createBlock('faq', { heading: '' })],
  },
];
