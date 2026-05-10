export default function SupportPage() {
  return (
    <div className="container" style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
      <h1>Support — Shadowing DE</h1>

      <section style={{ marginTop: 32 }}>
        <h2>📧 Kontakt</h2>
        <p>
          Bei Fragen, Problemen oder Feedback erreichen Sie uns unter:<br />
          <a href="mailto:hoatiuthu@gmail.com" style={{ color: '#a855f7' }}>
            hoatiuthu@gmail.com
          </a>
        </p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>❓ Häufig gestellte Fragen (FAQ)</h2>

        <div style={{ marginTop: 16 }}>
          <h3>Wie kann ich Lektionen herunterladen?</h3>
          <p>
            Tippen Sie auf der Startseite auf den Button „Jetzt herunterladen" oder „Sync".
            Alle verfügbaren Lektionen werden auf Ihr Gerät heruntergeladen und stehen dann
            auch ohne Internetverbindung zur Verfügung.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3>Kann ich die App offline nutzen?</h3>
          <p>
            Ja! Nach dem Herunterladen der Lektionen können Sie alle Untertitel-Texte offline lesen
            und üben. Für die Video-Wiedergabe wird jedoch eine Internetverbindung benötigt, da die
            Videos über YouTube gestreamt werden.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3>Was ist der Unterschied zwischen Shadowing und Diktat?</h3>
          <p>
            <strong>Shadowing (🎧):</strong> Hören Sie zu und sprechen Sie den Satz nach.
            Sie können den Text ein- oder ausblenden.<br />
            <strong>Diktat (✍️):</strong> Hören Sie den Satz und versuchen Sie, ihn aufzuschreiben.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3>Wie kann ich meinen Fortschritt zurücksetzen?</h3>
          <p>
            Gehen Sie zu Einstellungen (⚙️) und tippen Sie auf „Alle Offline-Daten löschen".
            Dadurch werden alle heruntergeladenen Lektionen und Ihr Lernfortschritt entfernt.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3>Welche Geräte werden unterstützt?</h3>
          <p>
            Shadowing DE ist für iPhone und iPad verfügbar und erfordert iOS 16.0 oder neuer.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>🇩🇪 Über die App</h2>
        <p>
          Shadowing DE hilft Ihnen, Ihr Hörverstehen durch echte YouTube-Videos zu verbessern.
          Üben Sie Satz für Satz mit interaktiven Untertiteln — perfekt für alle Sprachniveaus
          von A1 bis C2.
        </p>
      </section>

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #333', color: '#888', fontSize: 14 }}>
        <p>© 2026 Shadowing DE — Deutsch lernen mit Shadowing</p>
      </footer>
    </div>
  );
}
