import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth-forms';

export const metadata = { title: 'Criar conta' };

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
