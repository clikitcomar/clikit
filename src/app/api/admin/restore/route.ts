import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

interface BackupData {
  version: number;
  kiosco?: { name?: string };
  branches?: Array<{ id: string; name: string; primaryColor?: string; bgColor?: string; address?: string; phone?: string; allowNegativeStock?: boolean; blindClose?: boolean }>;
  categories?: Array<{ id: string; name: string; color?: string; showInGrid?: boolean; customTaxPercent?: number; taxType?: string }>;
  products?: Array<{ id: string; name: string; barcode?: string; emoji?: string; brand?: string; description?: string; presentation?: string; internalCode?: string; notes?: string; supplierName?: string; soldByWeight?: boolean; categoryId?: string }>;
  inventory?: Array<{ productId: string; branchId: string; price: number; cost?: number; stock?: number; minStock?: number; showInGrid?: boolean }>;
  variantInventories?: Array<{ variantId: string; branchId: string; price?: number; cost?: number; stock?: number; minStock?: number }>;
  stockLots?: Array<{ productId: string; variantId?: string; branchId: string; quantity: number; expiresOn?: string; ingressOrder?: number }>;
  employees?: Array<{ name: string; role?: string; active?: boolean }>;
  creditCustomers?: Array<{ name: string; phone?: string; balance?: number; creditLimit?: number; branchId: string }>;
  promotions?: Array<{ type: string; name: string; active?: boolean; discountKind: string; discountValue: number; startHour?: number; endHour?: number; weekdays?: number[]; daysBeforeExpiry?: number; returnCouponThreshold?: number; returnCouponValidityHours?: number; branchId: string; combos?: Array<{ productId: string; variantId?: string; quantity?: number }> }>;
  coupons?: Array<{ code: string; branchId: string; discountKind: string; discountValue: number; expiresAt?: string }>;
  ticketSettings?: Array<{ branchId: string; showLogo?: boolean; showAddress?: boolean; showPhone?: boolean; showFooterText?: boolean; footerText?: string; printMode?: string; orderLink?: string }>;
  fiscalProfile?: { cuit?: string; razonSocial?: string; domicilioFiscal?: string; condicionIva?: string; inicioActividad?: string; ingresosBrutos?: string; environment?: string } | null;
  branchFiscalSettings?: Array<{ branchId: string; activo?: boolean; puntoDeVenta?: number; minimumInvoiceAmount?: number }>;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño puede restaurar backup." }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "No se encontró el kiosco." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Archivo de backup inválido." }, { status: 400 });
  }

  const backup = body as BackupData;

  if (!backup.version || backup.version !== 1) {
    return NextResponse.json({ error: "Versión de backup no soportada." }, { status: 400 });
  }

  const mode = typeof body.mode === "string" ? body.mode : "merge";

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (mode === "replace") {
        await tx.coupon.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.promotion.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.stockLot.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.variantInventory.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.inventoryRecord.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.creditCustomer.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.ticketSettings.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.branchFiscalSettings.deleteMany({ where: { branch: { kioscoId: kiosco.id } } });
        await tx.branch.deleteMany({ where: { kioscoId: kiosco.id } });
        await tx.category.deleteMany({ where: { kioscoId: kiosco.id } });
        await tx.product.deleteMany({ where: { kioscoId: kiosco.id } });
        await tx.employee.deleteMany({ where: { kioscoId: kiosco.id } });
      }

      const branchIdMap = new Map<string, string>();
      if (backup.branches) {
        for (const b of backup.branches) {
          const existing = await tx.branch.findFirst({
            where: { kioscoId: kiosco.id, name: b.name },
            select: { id: true },
          });

          if (existing) {
            branchIdMap.set(b.id, existing.id);
            await tx.branch.update({
              where: { id: existing.id },
              data: {
                primaryColor: b.primaryColor ?? undefined,
                bgColor: b.bgColor ?? undefined,
                address: b.address ?? undefined,
                phone: b.phone ?? undefined,
                allowNegativeStock: b.allowNegativeStock ?? false,
                blindClose: b.blindClose ?? false,
              },
            });
          } else {
            const created = await tx.branch.create({
              data: {
                kioscoId: kiosco.id,
                name: b.name,
                primaryColor: b.primaryColor ?? "#22c55e",
                bgColor: b.bgColor ?? "#0f172a",
                address: b.address ?? null,
                phone: b.phone ?? null,
                allowNegativeStock: b.allowNegativeStock ?? false,
                blindClose: b.blindClose ?? false,
              },
            });
            branchIdMap.set(b.id, created.id);
          }
        }
      }

      if (backup.branches && backup.branches.length === 0 && !backup.branches) {
        const defaultBranch = await tx.branch.create({
          data: { kioscoId: kiosco.id, name: "Principal" },
        });
        branchIdMap.set("default", defaultBranch.id);
      }

      const defaultBranchId = branchIdMap.values().next().value ?? "";

      const categoryIdMap = new Map<string, string>();
      if (backup.categories) {
        for (const c of backup.categories) {
          const created = await tx.category.create({
            data: {
              kioscoId: kiosco.id,
              name: c.name,
              color: c.color ?? null,
              showInGrid: c.showInGrid ?? true,
              customTaxPercent: c.customTaxPercent ?? null,
              taxType: (c.taxType as any) ?? "IVA_21",
            },
          });
          categoryIdMap.set(c.id, created.id);
        }
      }

      const productIdMap = new Map<string, string>();
      if (backup.products) {
        for (const p of backup.products) {
          const resolvedCategoryId = p.categoryId ? (categoryIdMap.get(p.categoryId) ?? null) : null;
          const created = await tx.product.create({
            data: {
              kioscoId: kiosco.id,
              name: p.name,
              barcode: p.barcode ?? null,
              emoji: p.emoji ?? null,
              brand: p.brand ?? null,
              description: p.description ?? null,
              presentation: p.presentation ?? null,
              internalCode: p.internalCode ?? null,
              notes: p.notes ?? null,
              supplierName: p.supplierName ?? null,
              soldByWeight: p.soldByWeight ?? false,
              categoryId: resolvedCategoryId,
            },
          });
          productIdMap.set(p.id, created.id);
        }
      }

      if (backup.inventory) {
        for (const inv of backup.inventory) {
          const resolvedProductId = productIdMap.get(inv.productId);
          const resolvedBranchId = branchIdMap.get(inv.branchId) ?? defaultBranchId;
          if (!resolvedProductId || !resolvedBranchId) continue;

          await tx.inventoryRecord.upsert({
            where: { productId_branchId: { productId: resolvedProductId, branchId: resolvedBranchId } },
            create: {
              productId: resolvedProductId,
              branchId: resolvedBranchId,
              price: inv.price,
              cost: inv.cost ?? null,
              stock: inv.stock ?? null,
              minStock: inv.minStock ?? 0,
              showInGrid: inv.showInGrid ?? true,
            },
            update: {
              price: inv.price,
              cost: inv.cost ?? undefined,
              stock: inv.stock ?? undefined,
              minStock: inv.minStock ?? undefined,
            },
          });
        }
      }

      if (backup.employees) {
        for (const e of backup.employees) {
          await tx.employee.create({
            data: {
              kioscoId: kiosco.id,
              name: e.name,
              role: (e.role as any) ?? "CASHIER",
              active: e.active ?? true,
            },
          });
        }
      }

      let restored = { branches: branchIdMap.size, categories: categoryIdMap.size, products: productIdMap.size, employees: backup.employees?.length ?? 0, creditCustomers: 0 };

      if (backup.creditCustomers) {
        for (const c of backup.creditCustomers) {
          const resolvedBranchId = branchIdMap.get(c.branchId) ?? defaultBranchId;
          if (!resolvedBranchId) continue;
          await tx.creditCustomer.create({
            data: {
              branchId: resolvedBranchId,
              name: c.name,
              phone: c.phone ?? null,
              balance: c.balance ?? 0,
              creditLimit: c.creditLimit ?? null,
            },
          });
        }
        restored = { ...restored, creditCustomers: backup.creditCustomers.length };
      }

      return restored;
    });

    return NextResponse.json({ ok: true, restored: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: `Error durante la restauración: ${message}` }, { status: 500 });
  }
}
