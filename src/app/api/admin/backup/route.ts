import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño puede exportar backup." }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, name: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "No se encontró el kiosco." }, { status: 404 });
  }

  const [
    branches,
    categories,
    products,
    inventoryRecords,
    variantInventories,
    stockLots,
    employees,
    creditCustomers,
    promotions,
    coupons,
    ticketSettings,
    fiscalProfile,
    branchFiscalSettings,
  ] = await Promise.all([
    prisma.branch.findMany({
      where: { kioscoId: kiosco.id },
      select: {
        id: true, name: true, primaryColor: true, bgColor: true, address: true, phone: true,
        allowNegativeStock: true, blindClose: true, accessKey: true,
      },
    }),
    prisma.category.findMany({
      where: { kioscoId: kiosco.id },
      select: { id: true, name: true, color: true, showInGrid: true, customTaxPercent: true, taxType: true },
    }),
    prisma.product.findMany({
      where: { kioscoId: kiosco.id },
      select: {
        id: true, name: true, barcode: true, emoji: true, brand: true, description: true,
        presentation: true, internalCode: true, notes: true, supplierName: true, soldByWeight: true,
        categoryId: true,
      },
    }),
    prisma.inventoryRecord.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { productId: true, branchId: true, price: true, cost: true, stock: true, minStock: true, showInGrid: true },
    }),
    prisma.variantInventory.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { variantId: true, branchId: true, price: true, cost: true, stock: true, minStock: true },
    }),
    prisma.stockLot.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { productId: true, variantId: true, branchId: true, quantity: true, expiresOn: true, ingressOrder: true },
    }),
    prisma.employee.findMany({
      where: { kioscoId: kiosco.id },
      select: { id: true, name: true, role: true, active: true },
    }),
    prisma.creditCustomer.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { name: true, phone: true, balance: true, creditLimit: true, branchId: true },
    }),
    prisma.promotion.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: {
        id: true, type: true, name: true, active: true, discountKind: true, discountValue: true,
        startHour: true, endHour: true, weekdays: true, daysBeforeExpiry: true,
        returnCouponThreshold: true, returnCouponValidityHours: true, branchId: true,
        combos: { select: { productId: true, variantId: true, quantity: true } },
      },
    }),
    prisma.coupon.findMany({
      where: { branch: { kioscoId: kiosco.id }, isUsed: false },
      select: { code: true, branchId: true, discountKind: true, discountValue: true, expiresAt: true },
    }),
    prisma.ticketSettings.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { branchId: true, showLogo: true, showAddress: true, showPhone: true, showFooterText: true, footerText: true, printMode: true, orderLink: true },
    }),
    prisma.fiscalProfile.findUnique({
      where: { kioscoId: kiosco.id },
      select: { cuit: true, razonSocial: true, domicilioFiscal: true, condicionIva: true, inicioActividad: true, ingresosBrutos: true, environment: true },
    }),
    prisma.branchFiscalSettings.findMany({
      where: { branch: { kioscoId: kiosco.id } },
      select: { branchId: true, activo: true, puntoDeVenta: true, minimumInvoiceAmount: true },
    }),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    kiosco: { name: kiosco.name },
    branches,
    categories,
    products,
    inventory: inventoryRecords,
    variantInventories,
    stockLots,
    employees: employees.map((e) => ({ name: e.name, role: e.role, active: e.active })),
    creditCustomers,
    promotions,
    coupons,
    ticketSettings,
    fiscalProfile,
    branchFiscalSettings,
  };

  return NextResponse.json(backup, {
    headers: {
      "Content-Disposition": `attachment; filename="clikit-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
