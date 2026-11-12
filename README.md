# PitchSnitch

**Notenlesen üben** – eine Web-App zum Üben des Notenlesens am eigenen Instrument. Die App zeigt zufällige Noten, man spielt sie, und das Mikrofon prüft jede Note: richtig gespielte Noten werden grün, falsche erscheinen rot daneben.

Sie richtet sich an Lernende, die mit dem Unterricht Schritt halten wollen: Instrument und Notierung, Lagen, einzelne Töne, Tonart, Notenwerte, Taktart und Tempo lassen sich genau auf den aktuellen Lernstand einstellen.

- läuft vollständig im Browser, ohne Server-Komponente, ohne Konto, ohne Cookies und ohne Tracking
- das Mikrofonsignal wird nur lokal ausgewertet und nie übertragen
- Deutsch und Englisch

Diese App wurde mit Unterstützung von KI entwickelt; Anforderungen, Entscheidungen und Tests stammen vom Autor.

## Nutzung

Die App ist eine statische Website und läuft in aktuellen Versionen von Chrome, Edge, Firefox und Safari. Für die Tonerkennung braucht sie Zugriff auf das Mikrofon; Browser erlauben das nur über HTTPS (oder lokal über `localhost`). Auf Smartphones bitte das Gerät quer halten.

Es gibt keinen Build-Schritt: Die Dateien dieses Repositorys können unverändert auf jedem statischen Webserver bereitgestellt werden, z. B. über GitHub Pages.

## Datenschutz und Impressum

Siehe `datenschutz.html` und `impressum.html` (englisch: `datenschutz-en.html`, `impressum-en.html`).

## Lizenz

Der eigene Code steht unter [CC0 1.0](LICENSE) (gemeinfrei). Mitgelieferte Bibliotheken und Schriften behalten ihre Lizenzen (MIT bzw. SIL Open Font License 1.1), siehe `lizenzen.html` und `vendor/`.
