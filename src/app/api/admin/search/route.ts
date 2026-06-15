import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/platform-admin";

// GET /api/admin/search?query=XXX
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim() ?? "";

  if (!query || query.length < 2) {
    return NextResponse.json({ kioscos: [], branches: [], users: [] });
  }

  // Search kioscos by name
  const kioscos = await prisma.kiosco.findMany({
    where: {
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      owner: {
        select: {
          email: true,
          name: true,
        },
      },
      branches: {
        select: {
          id: true,
          name: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    take: 10,
  });

  // Search users by email
  const users = await prisma.user.findMany({
    where: {
      email: {
        contains: query,
        mode: "insensitive",
      },
    },
    select: {
      email: true,
      name: true,
      kiosco: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: 10,
  });

  // Search branches by name
  const branches = await prisma.branch.findMany({
    where: {
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      kiosco: {
        select: {
          id: true,
          name: true,
          owner: {
            select: {
              email: true,
            },
          },
        },
      },
    },
    take: 10,
  });

  return NextResponse.json({
    kioscos: kioscos.map((k) => ({
      id: k.id,
      name: k.name,
      email: k.owner.email,
      branchCount: k.branches.length,
    })),
    users: users.map((u) => ({
      email: u.email,
      name: u.name,
      kioscoId: u.kiosco?.id,
      kioscoName: u.kiosco?.name,
    })),
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      kioscoId: b.kiosco.id,
      kioscoName: b.kiosco.name,
      email: b.kiosco.owner.email,
    })),
  });
}
