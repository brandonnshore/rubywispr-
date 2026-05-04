import type { Metadata } from "next";

import { AuthRouteShell } from "../../_components/auth-route-shell";

export const metadata: Metadata = {
  title: "Sign in | RubyWhisper",
  description: "Sign in to RubyWhisper with an email link.",
};

export default function SignInPage() {
  return <AuthRouteShell mode="sign-in" />;
}
