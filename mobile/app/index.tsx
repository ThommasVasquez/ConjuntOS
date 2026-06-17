import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

// Entry route. By the time this renders the root layout has already gated on
// useAuth.bootstrap(), so `user` reflects the persisted session.
export default function Index() {
  const user = useAuth((s) => s.user);
  return <Redirect href={user ? '/(app)/inicio' : '/login'} />;
}
