# Podcast-

Statische Demo-Webseite (für GitHub Pages), die aus einer angegebenen URL einen kurzen Podcast erzeugt:

1. URL eingeben
2. Inhalt wird geladen und an Azure OpenAI gesendet
3. Azure OpenAI erzeugt SSML für einen Podcast mit zwei Speakern (~2 Minuten)
4. SSML wird an Azure Speech (Text-to-Speech) gesendet
5. Audio wird direkt auf der Webseite abgespielt

## GitHub Pages Deployment

Die Anwendung besteht nur aus statischen Dateien (`index.html`, `styles.css`, `app.js`) und ist dadurch direkt mit GitHub Pages kompatibel.

## Nutzung

1. Öffne die Seite.
2. Trage unter **Konfiguration** deine Azure-Werte ein:
   - Azure OpenAI Endpoint
   - Azure OpenAI API Key
   - Azure OpenAI Deployment Name
   - Azure OpenAI API Version
   - Azure Speech Key
   - Azure Speech Region (und optional ein eigener Speech Endpoint)
   - Zwei Voice-Namen für die Speaker
3. Konfiguration speichern (wird im Browser via Local Storage gespeichert).
4. Ziel-URL eingeben und **SSML + Audio erzeugen** klicken.
5. Das erzeugte SSML wird angezeigt und das Audio kann im Player abgespielt werden.
6. Im Bereich **Debug Logging (Anfragen / Antworten)** können Backend-Requests und Responses zu Azure OpenAI und Azure Speech aufgeklappt werden.

## Hinweise

- Diese Demo läuft vollständig im Browser. API-Keys bleiben daher nicht serverseitig geschützt.
- Viele Websites blockieren direkte Browser-Requests (CORS). Dafür gibt es ein konfigurierbares Proxy-Feld (`{url}` Platzhalter), standardmäßig mit `allorigins`.
- Logging ist für Debugging gedacht und zeigt keine API-Keys, aber Request-/Response-Inhalte (gekürzt) an.
