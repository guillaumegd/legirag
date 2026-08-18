import type { Metadata } from 'next';
import { Libre_Franklin } from 'next/font/google';
import { SiteHeader } from '../components/site-header';
import './globals.css';
import './site.css';

const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-libre-franklin',
});

export const metadata: Metadata = {
  title: 'legirag',
  description: "Posez une question juridique en français, obtenez une réponse sourcée article par article.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={libreFranklin.variable}>
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
