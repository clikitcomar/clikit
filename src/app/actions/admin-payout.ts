"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { revalidatePath } from "next/cache";

export async function approvePayoutRequest(payoutId: string) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) throw new Error("No autorizado");

  await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: { status: "APPROVED" }
  });

  revalidatePath("/admin/partners/payouts");
}

export async function rejectPayoutRequest(payoutId: string) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) throw new Error("No autorizado");

  await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: { status: "REJECTED" }
  });

  revalidatePath("/admin/partners/payouts");
}

export async function markPayoutAsPaid(payoutId: string) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) throw new Error("No autorizado");

  await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: {
      status: "PAID",
      paidAt: new Date()
    }
  });

  revalidatePath("/admin/partners/payouts");
  revalidatePath("/partner");
}
