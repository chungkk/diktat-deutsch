import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-left">
            <span className="footer-brand">✨ Diktat Deutsch 🇩🇪</span>
            <span className="footer-copy">
              © {new Date().getFullYear()} — Mit 💜 gemacht für Deutschlerner
            </span>
          </div>
          <div className="footer-links">
            <Link href="/support">💌 Support</Link>
            <Link href="/privacy">🔒 Datenschutz</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
