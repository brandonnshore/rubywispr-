import type { ReactNode } from "react";

import { AuthClerkProvider } from "./_components/auth-route-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthClerkProvider>{children}</AuthClerkProvider>;
}
