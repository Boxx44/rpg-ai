import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'RPG AI', template: '%s · RPG AI' },
  description: 'Plataforma de RPG de mesa com mestre humano, mestre de IA ou ambos.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#09080d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
