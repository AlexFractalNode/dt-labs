const de = {
  app: {
    title: 'DT Labs',
  },
  nav: {
    home: 'Start',
    splits: 'Split-Werkstatt',
    complexity: 'Komplexitäts-Labor',
    forest: 'Forest-Labor',
    label: 'Werkzeuge',
  },
  lang: {
    toggle: 'Sprache wechseln',
  },
  notice: {
    invalidUrl: 'Die Adresse enthält ungültige Angaben. Es wird die Standardansicht gezeigt.',
    dismiss: 'Hinweis schließen',
  },
  home: {
    title: 'Entscheidungsbäume zum Ausprobieren',
    lead: 'Drei Werkzeuge begleiten das Notebook zu Entscheidungsbäumen und Random Forests: Du wählst Splits selbst, stellst die Komplexität eines Baums ein und vergleichst viele Bäume im Wald.',
    toolsTitle: 'Werkzeuge',
    goal: 'Lernziel',
    open: '{tool} öffnen',
    tool: {
      splits: {
        summary: 'Wähle Splits Schritt für Schritt, sieh Impurität und Gewinn jedes Kandidaten und lass den Baum wachsen.',
        goal: 'Du verstehst, warum ein Split gewählt wird und wie sich Gleichstände und Kriterien auswirken.',
      },
      complexity: {
        summary: 'Verändere Tiefe, Mindestgrößen und Pruning und beobachte Entscheidungsregionen, Kreuzvalidierung und Pruning-Pfad.',
        goal: 'Du erkennst Über- und Unteranpassung und wählst die Komplexität eines Baums begründet.',
      },
      forest: {
        summary: 'Baue einen Wald aus Bootstrap-Bäumen, vergleiche Votum und Mittelung und miss die Varianz einer Vorhersage.',
        goal: 'Du verstehst, warum ein Wald weniger streut als ein einzelner Baum und wann Korrelation das begrenzt.',
      },
    },
    noticeTitle: 'Hinweis',
    notice: 'Alles läuft im Browser, Daten verlassen deinen Rechner nicht. Die Texte sind eigenständig geschrieben; Verweise wie „Lehrbuch Kap. 9“ zeigen nur, wo das Thema im Kurs behandelt wird.',
  },
  ref: {
    badge: 'Lehrbuch Kap. {chapter} · Notebook Zelle {code}',
    badgeNoCode: 'Lehrbuch Kap. {chapter}',
  },
  plot: {
    point: 'Datenpunkt',
  },
  status: {
    loading: 'Berechne …',
    empty: 'Keine Daten vorhanden.',
    error: 'Fehler:',
  },
}

export default de
