export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <span className="footer-brand">🇩🇪 Diktat Deutsch</span>
          <span className="footer-copy">© {new Date().getFullYear()} — Hörverstehen üben mit echten Videos</span>
        </div>
      </div>
    </footer>
  );
}
