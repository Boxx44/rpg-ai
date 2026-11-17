import type { MeDto } from '@rpg-ai/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@rpg-ai/ui';
import { ProfileForm } from '@/components/profile-form';
import { api } from '@/lib/api';
import { serverToken } from '@/lib/supabase-server';

export const metadata = { title: 'Perfil' };

export default async function ProfilePage() {
  const me = await api<MeDto>('/me', await serverToken());
  return (
    <div className="mx-auto max-w-xl space-y-8 animate-rise">
      <h1 className="font-display text-3xl tracking-wide">Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>{me.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm me={me} />
        </CardContent>
      </Card>
    </div>
  );
}
