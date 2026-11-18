import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PREFS_INIT_SCRIPT } from '@/lib/prefs-script';

export const metadata: Metadata = {
  title: { default: 'RPG AI', template: '%s · RPG AI' },
  description: 'Plataforma de RPG de mesa com mestre humano, mestre de IA ou ambos.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#09080d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica tamanho de texto/tema/contraste salvos antes de desenhar a página. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
