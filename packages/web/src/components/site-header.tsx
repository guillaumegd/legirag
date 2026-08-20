export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand" href="/">
          <img className="brand-mark" src="/logo.png" alt="" width={28} height={28} />
          <span className="brand-wordmark">legirag</span>
          <span className="brand-tagline">Recherche juridique sourcée</span>
        </a>
      </div>
    </header>
  );
}
