import { redirect } from "next/navigation";

import OnboardingExperience from "@/components/onboarding/OnboardingExperience";
import { resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth } from "@/lib/auth";
import { getPlatformSalesPolicy } from "@/lib/platform-sales-policy";

export default async function OnboardingPage() {
  const session = await auth();
  const appStartPath = resolveSessionAppStartPath(session?.user);

  if (session?.user?.id && appStartPath !== "/onboarding") {
    redirect(appStartPath);
  }

  const policy = await getPlatformSalesPolicy();
  return <OnboardingExperience subscriptionPriceArs={policy.subscriptionPriceArs} />;
}
