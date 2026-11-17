import { Card, CardContent, Ornament } from '@rpg-ai/ui';
import { Sigil } from '@/components/brand';
import { AcceptInvitation } from '@/components/campaign-forms';

export const metadata = { title: 'Convite' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md pt-6 animate-rise">
      <Card className="text-center">
        <CardContent className="space-y-6 pt-10 pb-8">
          <Sigil size={56} className="mx-auto" />
          <div className="space-y-2">
            <h1 className="font-display text-2xl tracking-wide">Você foi convocado</h1>
            <p className="text-sm text-ink-muted">
              Alguém convidou você para uma campanha. Aceite para entrar na mesa.
            </p>
          </div>
          <Ornament />
          <AcceptInvitation token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
