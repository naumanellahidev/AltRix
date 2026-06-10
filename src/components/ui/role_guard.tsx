import React, { ReactNode } from 'react';
import { useSession } from '@/hooks/useSession';

type Props = {
  role: string;
  children: ReactNode;
};

/**
 * Renders children only if the current user's role matches the required role.
 * If the user does not have the required role, nothing is rendered.
 */
export const RoleGuard = ({ role, children }: Props) => {
  const { user } = useSession();
  // Assuming the user object contains a `role` string field.
  if (!user || (user as any).role !== role) {
    return null;
  }
  return <>{children}</>;
};
