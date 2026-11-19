import credits from '@/public/lpc/CREDITS.json';

export const metadata = { title: 'Créditos · RPG AI' };

type Credit = { authors: string[]; licenses: string[]; urls: string[] };

/** Créditos dos artistas das peças em pixel art (biblioteca aberta LPC), exigidos pelas licenças. */
export default function CreditsPage() {
  const list = Object.entries(credits as Record<string, Credit>).sort(([a], [b]) => a.localeCompare(b));
  const authors = [...new Set(list.flatMap(([, c]) => c.authors))].sort((a, b) => a.localeCompare(b));
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <h1 className="font-display text-3xl">Créditos</h1>
      <p className="text-ink-muted">
        Os personagens em pixel art usam peças do projeto aberto{' '}
        <a
          className="underline"
          href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator"
        >
          Liberated Pixel Cup (LPC)
        </a>
        , sob as licenças CC-BY-SA, CC-BY, OGA-BY, GPL ou CC0 indicadas abaixo. Os personagens montados com
        essas peças também ficam sob CC-BY-SA. Obrigado a todos os artistas:
      </p>
      <p className="text-sm text-ink">{authors.join(' · ')}</p>
      <div className="space-y-3">
        {list.map(([file, c]) => (
          <section key={file} className="rounded-lg border border-line p-3 text-sm">
            <h2 className="font-mono text-xs text-gold">{file}</h2>
            <p>Artistas: {c.authors.join(', ')}</p>
            <p className="text-ink-muted">Licenças: {c.licenses.join(', ')}</p>
            <ul className="mt-1 list-inside list-disc text-xs text-ink-faint">
              {c.urls.map((u) => (
                <li key={u}>
                  <a className="underline" href={u}>
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
