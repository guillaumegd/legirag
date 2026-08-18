import type { Metadata } from 'next';
import { SiteHeader } from '../components/site-header';
import './globals.css';
import './site.css';

export const metadata: Metadata = {
  title: 'legirag',
  description: "Posez une question juridique en français, obtenez une réponse sourcée article par article.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip-link" href="#main">
          Aller au contenu
        </a>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
