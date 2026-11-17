import { Card, CardContent, Ornament } from '@rpg-ai/ui';
import { NewCampaignForm } from '@/components/campaign-forms';

export const metadata = { title: 'Nova campanha' };

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-rise">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Forjar</p>
        <h1 className="font-display text-3xl tracking-wide">Nova campanha</h1>
        <p className="text-sm text-ink-muted">
          O sistema de regras será escolhido quando a importação de livros estiver disponível (Fase 2–3).
        </p>
      </div>
      <Ornament />
      <Card>
        <CardContent className="pt-6">
          <NewCampaignForm />
        </CardContent>
      </Card>
    </div>
  );
}
