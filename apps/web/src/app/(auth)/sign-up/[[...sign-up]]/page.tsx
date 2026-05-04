import type { Metadata } from "next";

import { AuthRouteShell } from "../../_components/auth-route-shell";

export const metadata: Metadata = {
  title: "Sign up | RubyWhisper",
  description: "Create a RubyWhisper account with an email link.",
};

export default function SignUpPage() {
  return <AuthRouteShell mode="sign-up" />;
}
