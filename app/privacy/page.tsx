export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
      <h1>Datenschutzerklärung — Shadowing DE</h1>
      <p style={{ color: '#888' }}>Zuletzt aktualisiert: 10. Mai 2026</p>

      <section style={{ marginTop: 32 }}>
        <h2>1. Verantwortlicher</h2>
        <p>
          Vu Van Chung<br />
          E-Mail: <a href="mailto:hoatiuthu@gmail.com" style={{ color: '#a855f7' }}>hoatiuthu@gmail.com</a>
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>2. Datenerhebung</h2>
        <p>
          Shadowing DE erhebt <strong>keine personenbezogenen Daten</strong>. Die App erfordert
          keine Registrierung und kein Login. Es werden keine Benutzernamen, E-Mail-Adressen
          oder andere persönliche Informationen erfasst.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>3. Lokale Datenspeicherung</h2>
        <p>
          Folgende Daten werden ausschließlich <strong>lokal auf Ihrem Gerät</strong> gespeichert:
        </p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Heruntergeladene Lektionsinhalte (Untertitel-Texte)</li>
          <li>Ihr persönlicher Lernfortschritt (abgeschlossene Sätze)</li>
          <li>Ihre Einstellungen (Wiedergabegeschwindigkeit, Lernmodus)</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Diese Daten werden nicht an Server übertragen und können jederzeit in den
          App-Einstellungen gelöscht werden.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>4. Netzwerkzugriff</h2>
        <p>Die App stellt Netzwerkverbindungen her für:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>
            <strong>Lektions-Synchronisation:</strong> Herunterladen von Lektionsmetadaten und
            Untertiteln von unserem Server (ckk.pro).
          </li>
          <li>
            <strong>YouTube-Wiedergabe:</strong> Videos werden über die offizielle YouTube IFrame
            API eingebettet. Es gelten die{' '}
            <a href="https://policies.google.com/privacy" style={{ color: '#a855f7' }}>
              Datenschutzrichtlinien von Google/YouTube
            </a>.
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>5. Drittanbieter</h2>
        <p>
          Die App verwendet keine Analyse-Tools, Werbenetzwerke oder sonstige Tracking-Dienste.
          Die einzige Drittanbieter-Integration ist die YouTube IFrame API zur Videowiedergabe.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>6. Keine Weitergabe an Dritte</h2>
        <p>
          Da keine personenbezogenen Daten erhoben werden, erfolgt auch keine Weitergabe an Dritte.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>7. Rechte der Nutzer</h2>
        <p>
          Da die App keine personenbezogenen Daten speichert, entfallen die üblichen Rechte
          auf Auskunft, Berichtigung und Löschung gemäß DSGVO. Alle lokal gespeicherten Daten
          können jederzeit in den Einstellungen der App gelöscht werden.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>8. Kontakt</h2>
        <p>
          Bei Fragen zum Datenschutz kontaktieren Sie uns bitte unter:{' '}
          <a href="mailto:hoatiuthu@gmail.com" style={{ color: '#a855f7' }}>hoatiuthu@gmail.com</a>
        </p>
      </section>

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #333', color: '#888', fontSize: 14 }}>
        <p>© 2026 Shadowing DE — Deutsch lernen mit Shadowing</p>
      </footer>
    </div>
  );
}
