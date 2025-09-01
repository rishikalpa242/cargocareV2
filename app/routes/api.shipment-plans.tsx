import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { prisma } from "~/lib/prisma.server";

// Helper function to create JSON responses
function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    let whereCondition: any = {};
    
    // Role-based access control
    if (user.role.name !== "ADMIN") {
      whereCondition.userId = user.id;
    }

    // Search functionality - search within JSONB data
    if (search) {
      whereCondition.OR = [
        {
          data: {
            path: ["loadingPort"],
            string_contains: search,
          },
        },
        {
          data: {
            path: ["destinationCountry"],
            string_contains: search,
          },
        },
        {
          data: {
            path: ["customer"],
            string_contains: search,
          },
        },
        {
          data: {
            path: ["portOfDischarge"],
            string_contains: search,
          },
        },
        {
          data: {
            path: ["carrierName"],
            string_contains: search,
          },
        },
        {
          data: {
            path: ["vesselName"],
            string_contains: search,
          },
        },
      ];
    }

    const [shipmentPlans, totalCount] = await Promise.all([
      prisma.shipmentPlan.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: offset,
        take: limit,
      }),
      prisma.shipmentPlan.count({
        where: whereCondition,
      }),
    ]);

    return json({
      shipmentPlans,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request);
    const method = request.method;

    if (method === "POST") {
      // Create new shipment plan
      const formData = await request.formData();
      const dataString = formData.get("data") as string;
      
      if (!dataString) {
        return json({ error: "Data is required" }, { status: 400 });
      }

      let data;
      try {
        data = JSON.parse(dataString);
      } catch {
        return json({ error: "Invalid JSON data" }, { status: 400 });
      }

      const shipmentPlan = await prisma.shipmentPlan.create({
        data: {
          data,
          userId: user.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return json({ shipmentPlan }, { status: 201 });
    }

    if (method === "PUT") {
      // Update shipment plan
      const formData = await request.formData();
      const id = formData.get("id") as string;
      const dataString = formData.get("data") as string;

      if (!id || !dataString) {
        return json({ error: "ID and data are required" }, { status: 400 });
      }

      let data;
      try {
        data = JSON.parse(dataString);
      } catch {
        return json({ error: "Invalid JSON data" }, { status: 400 });
      }

      // Check if user owns the shipment plan or is admin
      const existingPlan = await prisma.shipmentPlan.findUnique({
        where: { id },
      });

      if (!existingPlan) {
        return json({ error: "Shipment plan not found" }, { status: 404 });
      }

      if (user.role.name !== "ADMIN" && existingPlan.userId !== user.id) {
        return json({ error: "Forbidden" }, { status: 403 });
      }

      const shipmentPlan = await prisma.shipmentPlan.update({
        where: { id },
        data: { data },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return json({ shipmentPlan });
    }

    if (method === "DELETE") {
      // Delete shipment plan
      const formData = await request.formData();
      const id = formData.get("id") as string;

      if (!id) {
        return json({ error: "ID is required" }, { status: 400 });
      }

      // Check if user owns the shipment plan or is admin
      const existingPlan = await prisma.shipmentPlan.findUnique({
        where: { id },
      });

      if (!existingPlan) {
        return json({ error: "Shipment plan not found" }, { status: 404 });
      }

      if (user.role.name !== "ADMIN" && existingPlan.userId !== user.id) {
        return json({ error: "Forbidden" }, { status: 403 });
      }

      await prisma.shipmentPlan.delete({
        where: { id },
      });

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Shipment plans API error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
