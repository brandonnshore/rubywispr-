"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordSignedInAccountTermsAcceptance } from "./terms-acceptance";

export async function acceptAccountTermsPrivacy(formData: FormData) {
  if (formData.get("termsPrivacyAccepted") !== "on") {
    redirect("/account?terms=missing_acknowledgement");
  }

  const result = await recordSignedInAccountTermsAcceptance();

  if (result.status === "accepted") {
    revalidatePath("/account");
  }

  redirect(`/account?terms=${result.status}`);
}
