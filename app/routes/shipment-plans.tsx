import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  Form,
  useLoaderData,
  useNavigate,
  useNavigation,
  redirect,
  useActionData,
  useSearchParams,
  Link,
} from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { prisma } from "~/lib/prisma.server";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { AdminLayout } from "~/components/AdminLayout";
import { ColumnSelectorModal } from "~/components/ui/column-selector-modal";
import { BulkEditModal } from "~/components/ui/bulk-edit-modal";
import { useColumnPreferences } from "~/hooks/useColumnPreferences";
import { useState } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Shipment Plans - Cargo Care" },
    { name: "description", content: "Manage shipment plans and logistics" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request);

    // Only allow SHIPMENT_PLAN_TEAM and ADMIN
    if (
      user.role.name !== "SHIPMENT_PLAN_TEAM" &&
      user.role.name !== "ADMIN" &&
      user.role.name !== "MD"
    ) {
      return redirect("/dashboard");
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    let whereCondition: any = {};

    // Role-based access control
    console.log("User data:", user.id, "Role:", user.role.name);
    if (user?.role.name !== "ADMIN" && user?.role.name !== "MD") {
      whereCondition.userId = user.id;
    }

    // Search functionality

    if (search) {
      const searchConditions = [];

      // NON-ARRAY FIELDS (use Prisma's path syntax - these work fine)
      searchConditions.push(
        // Search in reference number
        {
          data: {
            path: ["reference_number"],
            string_contains: search,
          },
        },
        // Search in business branch
        {
          data: {
            path: ["bussiness_branch"],
            string_contains: search,
          },
        },
        // Search in shipment type
        {
          data: {
            path: ["shipment_type"],
            string_contains: search,
          },
        },
        // Search in booking status
        {
          data: {
            path: ["booking_status"],
            string_contains: search,
          },
        },
        // Search in container movement - loading port
        {
          data: {
            path: ["container_movement", "loading_port"],
            string_contains: search,
          },
        },
        // Search in container movement - destination country
        {
          data: {
            path: ["container_movement", "destination_country"],
            string_contains: search,
          },
        },
        // Search in container movement - customer
        {
          data: {
            path: ["container_movement", "customer"],
            string_contains: search,
          },
        },
        // Search in container movement - consignee
        {
          data: {
            path: ["container_movement", "consignee"],
            string_contains: search,
          },
        },
        // Search in container movement - port of discharge
        {
          data: {
            path: ["container_movement", "port_of_discharge"],
            string_contains: search,
          },
        },
        // Search in container movement - final place of delivery
        {
          data: {
            path: ["container_movement", "final_place_of_delivery"],
            string_contains: search,
          },
        },
        // Search in carrier and vessel preference - carrier
        {
          data: {
            path: [
              "container_movement",
              "carrier_and_vessel_preference",
              "carrier",
            ],
            string_contains: search,
          },
        },
        // Search in carrier and vessel preference - vessel
        {
          data: {
            path: [
              "container_movement",
              "carrier_and_vessel_preference",
              "vessel",
            ],
            string_contains: search,
          },
        },
        // Search in created user name
        {
          user: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        }
      );

      // ARRAY FIELDS (use raw SQL - these need to be converted)
      try {
        // Search in package details - shipper
        const shipperMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'package_details'->0->>'shipper' ILIKE ${`%${search}%`}
    `;

        if (shipperMatches.length > 0) {
          searchConditions.push({
            id: {
              in: shipperMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in package details - commodity
        const commodityMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'package_details'->0->>'commodity' ILIKE ${`%${search}%`}
    `;

        if (commodityMatches.length > 0) {
          searchConditions.push({
            id: {
              in: commodityMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in package details - invoice number
        const invoiceMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'package_details'->0->>'invoice_number' ILIKE ${`%${search}%`}
    `;

        if (invoiceMatches.length > 0) {
          searchConditions.push({
            id: {
              in: invoiceMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in package details - PO number
        const poMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'package_details'->0->>'p_o_number' ILIKE ${`%${search}%`}
    `;

        if (poMatches.length > 0) {
          searchConditions.push({
            id: {
              in: poMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in equipment details - equipment type
        const equipmentTypeMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'equipment_details'->0->>'equipment_type' ILIKE ${`%${search}%`}
    `;

        if (equipmentTypeMatches.length > 0) {
          searchConditions.push({
            id: {
              in: equipmentTypeMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in equipment details - stuffing point
        const stuffingPointMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'equipment_details'->0->>'stuffing_point' ILIKE ${`%${search}%`}
    `;

        if (stuffingPointMatches.length > 0) {
          searchConditions.push({
            id: {
              in: stuffingPointMatches.map((row: any) => row.id),
            },
          });
        }

        // Search in equipment details - empty container pick up from
        const emptyPickupMatches = await prisma.$queryRaw`
      SELECT id FROM "shipment_plans" 
      WHERE data->'equipment_details'->0->>'empty_container_pick_up_from' ILIKE ${`%${search}%`}
    `;

        if (emptyPickupMatches.length > 0) {
          searchConditions.push({
            id: {
              in: emptyPickupMatches.map((row: any) => row.id),
            },
          });
        }
      } catch (error) {
        console.error("Error in raw SQL search:", error);
      }

      whereCondition.OR = searchConditions;
    }

    const [
      shipmentPlans,
      totalCount,
      businessBranches,
      loadingPorts,
      portsOfDischarge,
      destinationCountries,
      carriers,
      vessels,
      organizations,
    ] = await Promise.all([
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
      prisma.businessBranch.findMany({ orderBy: { name: "asc" } }),
      prisma.loadingPort.findMany({ orderBy: { name: "asc" } }),
      prisma.portOfDischarge.findMany({ orderBy: { name: "asc" } }),
      prisma.destinationCountry.findMany({ orderBy: { name: "asc" } }),
      prisma.carrier.findMany({ orderBy: { name: "asc" } }),
      prisma.vessel.findMany({ orderBy: { name: "asc" } }),
      prisma.organization.findMany({ orderBy: { name: "asc" } }),
    ]);
    console.log("Shipment Plans - Retrieved count:", totalCount);
    console.log(
      "Shipment Plans - First 5 records (if any):",
      JSON.stringify(shipmentPlans.slice(0, 5), null, 2)
    );

    return {
      user,
      shipmentPlans,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      search,
      dataPoints: {
        businessBranches,
        loadingPorts,
        portsOfDischarge,
        destinationCountries,
        carriers,
        vessels,
        organizations,
      },
    };
  } catch (error) {
    return redirect("/login");
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request);

    // Only allow SHIPMENT_PLAN_TEAM and ADMIN
    if (user.role.name !== "SHIPMENT_PLAN_TEAM" && user.role.name !== "ADMIN") {
      return redirect("/dashboard");
    }

    const formData = await request.formData();
    const action = formData.get("action") as string;
    if (action === "delete") {
      const ids = formData.getAll("selectedIds") as string[];

      for (const id of ids) {
        const existingPlan = await prisma.shipmentPlan.findUnique({
          where: { id },
        });

        if (
          existingPlan &&
          (user.role.name === "ADMIN" || existingPlan.userId === user.id)
        ) {
          await prisma.shipmentPlan.delete({
            where: { id },
          });
        }
      }

      return { success: `${ids.length} shipment plan(s) deleted successfully` };
    }
    if (action === "approve") {
      const id = formData.get("id") as string;

      const existingPlan = await prisma.shipmentPlan.findUnique({
        where: { id },
      });

      if (!existingPlan) {
        return { error: "Shipment plan not found" };
      }

      if (user.role.name !== "ADMIN" && existingPlan.userId !== user.id) {
        return {
          error: "You don't have permission to approve this shipment plan",
        };
      }

      // Check if the plan is in "Awaiting MD Approval" status
      const planData = existingPlan.data as any;
      if (planData.booking_status !== "Awaiting MD Approval") {
        return {
          error:
            "Only plans with 'Awaiting MD Approval' status can be approved",
        };
      }

      // Update the status to "Awaiting Booking"
      const updatedData = {
        ...planData,
        booking_status: "Awaiting Booking",
      }; // Update shipment plan and create liner booking in a transaction
      await prisma.$transaction(async (tx) => {
        // Create a new liner booking with only the carrier booking status
        // Reference number will be pulled dynamically from linked shipment plan
        const linerBookingData = {
          carrier_booking_status: "Awaiting Booking",
        };

        const linerBooking = await tx.linerBooking.create({
          data: {
            data: linerBookingData,
            userId: user.id,
          },
        });

        // Update the shipment plan status and link it to the liner booking
        await tx.shipmentPlan.update({
          where: { id },
          data: {
            data: updatedData,
            linerBookingId: linerBooking.id, // Link to the created liner booking
          },
        });
      });

      return {
        success:
          "Shipment plan approved and liner booking created successfully",
      };
    }

    if (action === "copy") {
      const id = formData.get("id") as string;

      const existingPlan = await prisma.shipmentPlan.findUnique({
        where: { id },
      });

      if (!existingPlan) {
        return { error: "Shipment plan not found" };
      }

      if (user.role.name !== "ADMIN") {
        return {
          error: "You don't have permission to copy this shipment plan",
        };
      }

      const existingData = existingPlan.data as any;

      // Create a new reference number for the copied plan
      const originalReference = existingData.reference_number;

      // Extract the prefix and numeric suffix from the reference number
      const referenceMatch = originalReference.match(/^(.+?)(\d+)$/);

      if (!referenceMatch) {
        return { error: "Cannot parse reference number format for copying" };
      }

      const [, prefix, numberPart] = referenceMatch;
      const currentNumber = parseInt(numberPart, 10);
      const numberLength = numberPart.length;

      // Find all existing shipment plans with the same prefix
      const existingPlans = await prisma.shipmentPlan.findMany({
        where: {
          data: {
            path: ["reference_number"],
            string_starts_with: prefix,
          },
        },
        select: {
          data: true,
        },
      });

      // Extract all existing numbers with the same prefix
      const existingNumbers = new Set<number>();
      for (const plan of existingPlans) {
        const planData = plan.data as any;
        const refNumber = planData?.reference_number || "";
        const match = refNumber.match(
          new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`)
        );
        if (match) {
          const num = parseInt(match[1], 10);
          existingNumbers.add(num);
        }
      }

      // Find the next available number
      let nextNumber = currentNumber + 1;
      while (existingNumbers.has(nextNumber)) {
        nextNumber++;
      }

      const paddedNumber = nextNumber.toString().padStart(numberLength, "0");
      const newReferenceNumber = `${prefix}${paddedNumber}`;

      // Create copied data with selective copying - preserve party names and equipment details
      const copiedData = {
        ...existingData,
        reference_number: newReferenceNumber,
        booking_status: "Awaiting MD Approval", // Reset to initial status

        // Reset financial data
        selling_price: null,
        buying_price: null,

        // Reset container tracking to initial state
        container_tracking: {
          container_current_status: "Pending",
          container_stuffing_completed: false,
          container_stuffing_completed_date: null,
          empty_container_picked_up_status: false,
          empty_container_picked_up_date: null,
          gated_in_status: false,
          gated_in_date: null,
          loaded_on_board_status: false,
          loaded_on_board_date: null,
        },

        // Preserve party names, equipment details, and other operational data
        // These will be copied as-is:
        // - container_movement (includes customer, consignee, shipper details)
        // - package_details (includes shipper, commodity details)
        // - equipment_details (includes equipment type, stuffing point, etc.)
        // - carrier_and_vessel_preference
        // - bussiness_branch, shipment_type, etc.
      };

      // Create the new shipment plan (not linked to any liner booking)
      const newPlan = await prisma.shipmentPlan.create({
        data: {
          data: copiedData,
          userId: user.id,
          // Explicitly not setting linerBookingId
        },
      });

      return {
        success: `Shipment plan copied successfully with reference number: ${newReferenceNumber}. Party names and equipment details have been preserved.`,
        newPlanId: newPlan.id,
      };
    }

    if (action === "bulkEdit") {
      const ids = formData.getAll("selectedIds") as string[];
      const fieldsToUpdate: any = {};

      // Get all the fields to update from form data
      const businessBranch = formData.get("bulk_business_branch") as string;
      const shipmentType = formData.get("bulk_shipment_type") as string;
      const bookingStatus = formData.get("bulk_booking_status") as string;
      const loadingPort = formData.get("bulk_loading_port") as string;
      const destinationCountry = formData.get(
        "bulk_destination_country"
      ) as string;
      const portOfDischarge = formData.get("bulk_port_of_discharge") as string;
      const deliveryTill = formData.get("bulk_delivery_till") as string;
      const customer = formData.get("bulk_customer") as string;
      const consignee = formData.get("bulk_consignee") as string;
      const sellingPrice = formData.get("bulk_selling_price") as string;
      const buyingPrice = formData.get("bulk_buying_price") as string;
      const commodity = formData.get("bulk_commodity") as string;
      const equipmentType = formData.get("bulk_equipment_type") as string;
      const carrier = formData.get("bulk_carrier") as string;
      const vessel = formData.get("bulk_vessel") as string;

      // Only update fields that have values
      if (businessBranch) fieldsToUpdate.bussiness_branch = businessBranch;
      if (shipmentType) fieldsToUpdate.shipment_type = shipmentType;
      if (bookingStatus) fieldsToUpdate.booking_status = bookingStatus;
      if (sellingPrice)
        fieldsToUpdate.selling_price = parseFloat(sellingPrice) || 0;
      if (buyingPrice)
        fieldsToUpdate.buying_price = parseFloat(buyingPrice) || 0;

      // Container movement fields
      const containerFields: any = {};
      if (loadingPort) containerFields.loading_port = loadingPort;
      if (destinationCountry)
        containerFields.destination_country = destinationCountry;
      if (portOfDischarge) containerFields.port_of_discharge = portOfDischarge;
      if (deliveryTill) containerFields.delivery_till = deliveryTill;
      if (customer) containerFields.customer = customer;
      if (consignee) containerFields.consignee = consignee;
      if (carrier) containerFields.carrier = carrier;
      if (vessel) containerFields.vessel = vessel;

      // Package details fields
      const packageFields: any = {};
      if (commodity) packageFields.commodity = commodity;

      // Equipment details fields
      const equipmentFields: any = {};
      if (equipmentType) equipmentFields.equipment_type = equipmentType;

      if (
        Object.keys(fieldsToUpdate).length === 0 &&
        Object.keys(containerFields).length === 0 &&
        Object.keys(packageFields).length === 0 &&
        Object.keys(equipmentFields).length === 0
      ) {
        return { error: "No fields selected for bulk update" };
      }

      let updatedCount = 0;

      for (const id of ids) {
        const existingPlan = await prisma.shipmentPlan.findUnique({
          where: { id },
        });

        if (
          existingPlan &&
          (user.role.name === "ADMIN" || existingPlan.userId === user.id)
        ) {
          const currentData = existingPlan.data as any;
          const updatedData = { ...currentData };

          // Update root level fields
          Object.keys(fieldsToUpdate).forEach((key) => {
            updatedData[key] = fieldsToUpdate[key];
          });

          // Update container movement fields
          if (Object.keys(containerFields).length > 0) {
            if (!updatedData.container_movement)
              updatedData.container_movement = {};
            Object.keys(containerFields).forEach((key) => {
              updatedData.container_movement[key] = containerFields[key];
            });
          }

          // Update package details fields
          if (Object.keys(packageFields).length > 0) {
            if (!updatedData.package_details)
              updatedData.package_details = [{}];
            if (!updatedData.package_details[0])
              updatedData.package_details[0] = {};
            Object.keys(packageFields).forEach((key) => {
              updatedData.package_details[0][key] = packageFields[key];
            });
          }

          // Update equipment details fields
          if (Object.keys(equipmentFields).length > 0) {
            if (!updatedData.equipment_details)
              updatedData.equipment_details = [{}];
            if (!updatedData.equipment_details[0])
              updatedData.equipment_details[0] = {};
            Object.keys(equipmentFields).forEach((key) => {
              updatedData.equipment_details[0][key] = equipmentFields[key];
            });
          }

          await prisma.shipmentPlan.update({
            where: { id },
            data: { data: updatedData },
          });

          updatedCount++;
        }
      }

      return {
        success: `${updatedCount} shipment plan(s) updated successfully`,
      };
    }

    return { error: "Invalid action" };
  } catch (error) {
    console.error("Shipment plans action error:", error);
    return { error: "An error occurred while processing your request" };
  }
}

export default function ShipmentPlans() {
  const { user, shipmentPlans, pagination, search, dataPoints } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  // Column definitions for the table
  const availableColumns = [
    { id: "checkbox", label: "Select", defaultVisible: true, locked: true },
    { id: "reference_number", label: "Reference No.", defaultVisible: true },
    { id: "business_branch", label: "Business Branch", defaultVisible: true },
    { id: "shipment_type", label: "Type", defaultVisible: true },
    { id: "customer", label: "Customer", defaultVisible: true },
    { id: "loading_port", label: "Loading Port", defaultVisible: true },
    { id: "destination_country", label: "Destination", defaultVisible: true },
    { id: "booking_status", label: "Status", defaultVisible: true },
    {
      id: "port_of_discharge",
      label: "Port of Discharge",
      defaultVisible: true,
    },
    { id: "consignee", label: "Consignee", defaultVisible: true },
    { id: "selling_price", label: "Selling Price", defaultVisible: true },
    { id: "buying_price", label: "Buying Price", defaultVisible: true },
    { id: "carrier", label: "Carrier", defaultVisible: true },
    { id: "vessel", label: "Vessel", defaultVisible: true },
    { id: "container_status", label: "Container Status", defaultVisible: true },
    { id: "created_date", label: "Created", defaultVisible: true },
    { id: "created_by", label: "Created By", defaultVisible: true },
    { id: "actions", label: "Actions", defaultVisible: true, locked: true },
  ];

  // Use column preferences hook
  const {
    visibleColumns,
    isColumnModalOpen,
    setIsColumnModalOpen,
    updateColumnPreferences,
    resetColumnPreferences,
    isColumnVisible,
    getOrderedColumns,
  } = useColumnPreferences({
    storageKey: "shipment-plans-columns",
    columns: availableColumns,
  });

  const handleRowClick = (id: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const isInteractiveElement = target.closest(
      'button, a, input, [role="checkbox"]'
    );

    if (!isInteractiveElement) {
      navigate(`/shipment-plans/${id}/edit`);
    }
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(shipmentPlans.map((plan: any) => plan.id));
    } else {
      setSelectedIds([]);
    }
  };

  // Handle individual checkbox
  const handleSelectPlan = (planId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, planId]);
    } else {
      setSelectedIds(selectedIds.filter((id) => id !== planId));
    }
  };
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { color: string; bg: string; border: string; icon: string }
    > = {
      "Awaiting MD Approval": {
        color: "text-orange-800",
        bg: "bg-gradient-to-r from-orange-100 to-orange-50",
        border: "border-orange-200",
        icon: "⏳",
      },
      "Awaiting Booking": {
        color: "text-blue-800",
        bg: "bg-gradient-to-r from-blue-100 to-blue-50",
        border: "border-blue-200",
        icon: "📝",
      },
      Completed: {
        color: "text-green-800",
        bg: "bg-gradient-to-r from-green-100 to-green-50",
        border: "border-green-200",
        icon: "✅",
      },
      Cancelled: {
        color: "text-red-800",
        bg: "bg-gradient-to-r from-red-100 to-red-50",
        border: "border-red-200",
        icon: "❌",
      },
      "Unmapping Requested": {
        color: "text-purple-800",
        bg: "bg-gradient-to-r from-purple-100 to-purple-50",
        border: "border-purple-200",
        icon: "🔄",
      },
    };

    const config = statusConfig[status] || {
      color: "text-gray-800",
      bg: "bg-gradient-to-r from-gray-100 to-gray-50",
      border: "border-gray-200",
      icon: "📄",
    };

    return (
      <span
        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${config.color} ${config.bg} border ${config.border}`}
      >
        <span>{config.icon}</span>
        <span>{status}</span>
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // Function to get data for a specific column
  const getColumnData = (plan: any, columnId: string) => {
    switch (columnId) {
      case "checkbox":
        return (
          <TableCell key={columnId} className="pl-6">
            <div onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selectedIds.includes(plan.id)}
                onChange={(e) => handleSelectPlan(plan.id, e.target.checked)}
              />
            </div>
          </TableCell>
        );
      case "reference_number":
        return (
          <TableCell key={columnId} className="font-semibold text-gray-900">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span>{plan.data.reference_number || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "business_branch":
        return (
          <TableCell key={columnId} className="text-gray-700 font-medium">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🏢</span>
              <span>{plan.data.bussiness_branch || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "shipment_type":
        return (
          <TableCell key={columnId}>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-100 to-blue-50 text-blue-800 border border-blue-200">
              {plan.data.shipment_type || "N/A"}
            </span>
          </TableCell>
        );
      case "customer":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">👤</span>
              <span>{plan.data.container_movement?.customer || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "loading_port":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🚢</span>
              <span>{plan.data.container_movement?.loading_port || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "destination_country":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🌍</span>
              <span>
                {plan.data.container_movement?.destination_country || "N/A"}
              </span>
            </div>
          </TableCell>
        );
      case "booking_status":
        return (
          <TableCell key={columnId}>
            {getStatusBadge(plan.data.booking_status || "Awaiting MD Approval")}
          </TableCell>
        );
      case "port_of_discharge":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🏢</span>
              <span>
                {plan.data.container_movement?.port_of_discharge || "N/A"}
              </span>
            </div>
          </TableCell>
        );
      case "consignee":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">👤</span>
              <span>{plan.data.container_movement?.consignee || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "selling_price":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">💰</span>
              <span>
                {plan.data.container_movement?.selling_price || "N/A"}
              </span>
            </div>
          </TableCell>
        );
      case "buying_price":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">💰</span>
              <span>{plan.data.container_movement?.buying_price || "N/A"}</span>
            </div>
          </TableCell>
        );
      case "carrier":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🚛</span>
              <span>
                {plan.data.container_movement?.carrier_and_vessel_preference
                  ?.carrier || "N/A"}
              </span>
            </div>
          </TableCell>
        );
      case "vessel":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🚢</span>
              <span>
                {plan.data.container_movement?.carrier_and_vessel_preference
                  ?.vessel || "N/A"}
              </span>
            </div>
          </TableCell>
        );
      case "container_status":
        return (
          <TableCell key={columnId}>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                plan.data.container_status === "Booked"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              } border border-gray-200`}
            >
              {plan.data.container_status || "N/A"}
            </span>
          </TableCell>
        );
      case "created_date":
        return (
          <TableCell key={columnId} className="text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📅</span>
              <span>{formatDate(plan.createdAt)}</span>
            </div>
          </TableCell>
        );
      case "created_by":
        return (
          <TableCell key={columnId} className="text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-gray-600">
                  {plan.user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span>{plan.user.name}</span>
            </div>
          </TableCell>
        );
      case "actions":
        return (
          <TableCell key={columnId} className="pr-6">
            <div className="flex items-center space-x-2">
              {/* Approve button - only show for "Awaiting MD Approval" status */}
              {/* {plan.data.booking_status === "Awaiting MD Approval" && (
                <Form method="post" className="inline">
                  <input type="hidden" name="action" value="approve" />
                  <input type="hidden" name="id" value={plan.id} />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 px-3 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    <span className="mr-1">✅</span>
                    {isSubmitting ? 'Approving...' : 'Approve'}
                  </Button>
                </Form>
              )} */}

              {user.role.name == "ADMIN" && (
                <>
                  {/* Copy button */}
                  <Form method="post" className="inline">
                    <input type="hidden" name="action" value="copy" />
                    <input type="hidden" name="id" value={plan.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs font-medium rounded-lg border-orange-300 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600 transition-all duration-200"
                      title="Copy this shipment plan with all details (will not be linked to any liner booking)"
                      disabled={isSubmitting}
                    >
                      <span className="mr-1">📋</span>
                      {isSubmitting ? "Copying..." : "Copy"}
                    </Button>
                  </Form>
                </>
              )}

              {/* Edit button
              <Link to={`/shipment-plans/${plan.id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-4 text-xs font-medium rounded-lg border-gray-300 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200"
                >
                  <span className="mr-1">✏️</span>
                  Edit
                </Button>
              </Link> */}
            </div>
          </TableCell>
        );
      default:
        return <TableCell key={columnId}>N/A</TableCell>;
    }
  };
  return (
    <AdminLayout user={user}>
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Shipment Plans
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage and track your shipment plans
              </p>
            </div>
            <Link to="/shipment-plans/new">
              <Button className="bg-red-500 hover:bg-red-600 text-white">
                Add New Shipment Plan
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {/* Success/Error Messages */}
        {actionData?.success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            <div className="flex items-center justify-between">
              <span>{actionData.success}</span>
              {actionData?.newPlanId && (
                <Link
                  to={`/shipment-plans/${actionData.newPlanId}/edit`}
                  className="ml-4 text-green-600 hover:text-green-800 font-medium underline"
                >
                  View Copied Plan →
                </Link>
              )}
            </div>
          </div>
        )}
        {actionData?.error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {actionData.error}
          </div>
        )}{" "}
        {/* Enhanced Search and Actions */}
        <div className="mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
              <div className="flex-1 max-w-2xl">
                <Form method="get" className="relative">
                  <div className="relative flex gap-3">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm">🔍</span>
                      </div>
                      <Input
                        name="search"
                        placeholder="Search by reference, shipper, customer, carrier, vessel, commodity, ports, or any shipment details..."
                        defaultValue={search}
                        className="pl-10 pr-4 py-3 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200 hover:shadow-lg"
                    >
                      Search
                    </Button>
                    {search && (
                      <Link to="/shipment-plans">
                        <Button
                          variant="outline"
                          className="px-6 py-3 border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200"
                        >
                          Clear
                        </Button>
                      </Link>
                    )}
                  </div>
                </Form>
                {search && (
                  <p className="text-sm text-gray-600 mt-2">
                    <span className="font-medium">{pagination.totalCount}</span>{" "}
                    results found for "{search}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="font-medium">{pagination.totalCount}</span>{" "}
                  total plans
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Enhanced Shipment Plans Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-sm">📦</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Shipment Plans
                  </h3>
                  <p className="text-sm text-gray-500">
                    {pagination.totalCount} total plans
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsColumnModalOpen(true)}
                  className="flex items-center space-x-2 border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
                  title="Customize which columns to display and their order"
                >
                  <span className="text-sm">⚙️</span>
                  <span>Customize Columns</span>
                </Button>
                {selectedIds.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                      {selectedIds.length} selected
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setIsBulkEditModalOpen(true)}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                      disabled={isSubmitting}
                    >
                      ✏️ Bulk Edit
                    </Button>
                    <Form method="post">
                      <input type="hidden" name="action" value="delete" />
                      {selectedIds.map((id) => (
                        <input
                          key={id}
                          type="hidden"
                          name="selectedIds"
                          value={id}
                        />
                      ))}
                      <Button
                        type="submit"
                        size="sm"
                        className="bg-red-500 hover:bg-red-600 text-white"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Deleting..." : "Delete Selected"}
                      </Button>
                    </Form>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gradient-to-r from-slate-50 to-gray-50">
                <TableRow className="border-gray-200">
                  {visibleColumns.map((columnId) => {
                    const column = availableColumns.find(
                      (col) => col.id === columnId
                    );
                    if (!column) return null;

                    if (columnId === "checkbox") {
                      return (
                        <TableHead key={columnId} className="w-12 pl-6">
                          <Checkbox
                            checked={
                              selectedIds.length === shipmentPlans.length &&
                              shipmentPlans.length > 0
                            }
                            onChange={(e) => handleSelectAll(e.target.checked)}
                          />
                        </TableHead>
                      );
                    }

                    return (
                      <TableHead
                        key={columnId}
                        className="font-semibold text-gray-900 text-sm"
                      >
                        {column.label}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>{" "}
              <TableBody>
                {shipmentPlans.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumns.length}
                      className="text-center py-16"
                    >
                      <div className="flex flex-col items-center space-y-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl flex items-center justify-center">
                          <span className="text-4xl">📦</span>
                        </div>
                        <div className="space-y-3 max-w-md">
                          <h3 className="text-xl font-semibold text-gray-900">
                            No shipment plans found
                          </h3>
                          <p className="text-gray-500 leading-relaxed">
                            {search
                              ? "Try adjusting your search criteria or clear the search to see all shipment plans"
                              : "Get started by creating your first shipment plan to track your cargo logistics"}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Link to="/shipment-plans/new">
                            <Button className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 hover:shadow-lg">
                              <span className="mr-2">✨</span>
                              Create your first shipment plan
                            </Button>
                          </Link>
                          {search && (
                            <Link to="/shipment-plans">
                              <Button
                                variant="outline"
                                className="px-6 py-2 rounded-lg font-medium"
                              >
                                Clear search
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  shipmentPlans.map((plan: any, index: number) => (
                    <TableRow
                      key={plan.id}
                      onClick={(event) => handleRowClick(plan.id, event)}
                      className={`hover:bg-blue-50/50 hover:shadow-sm hover:border-l-4 hover:border-l-blue-500 transition-all duration-200 cursor-pointer ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      }`}
                    >
                      {visibleColumns.map((columnId) => {
                        const columnData = getColumnData(plan, columnId);
                        return columnData;
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>{" "}
        {/* Enhanced Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span className="font-medium">
                    Showing {(pagination.page - 1) * pagination.limit + 1}-
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.totalCount
                    )}
                  </span>
                  <span>of</span>
                  <span className="font-medium text-gray-900">
                    {pagination.totalCount}
                  </span>
                  <span>results</span>
                </div>

                <div className="flex items-center space-x-2">
                  {pagination.page > 1 && (
                    <Link
                      to={`?${new URLSearchParams({
                        ...Object.fromEntries(searchParams),
                        page: String(pagination.page - 1),
                      })}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="px-4 py-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200"
                      >
                        <span className="mr-1">←</span>
                        Previous
                      </Button>
                    </Link>
                  )}

                  <div className="flex items-center space-x-1">
                    {Array.from(
                      { length: Math.min(5, pagination.totalPages) },
                      (_, i) => {
                        const pageNumber =
                          Math.max(
                            1,
                            Math.min(
                              pagination.totalPages - 4,
                              pagination.page - 2
                            )
                          ) + i;
                        if (pageNumber > pagination.totalPages) return null;

                        return (
                          <Link
                            key={pageNumber}
                            to={`?${new URLSearchParams({
                              ...Object.fromEntries(searchParams),
                              page: String(pageNumber),
                            })}`}
                          >
                            <Button
                              variant={
                                pageNumber === pagination.page
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className={`w-10 h-10 ${
                                pageNumber === pagination.page
                                  ? "bg-blue-600 text-white hover:bg-blue-700"
                                  : "border-gray-300 hover:bg-gray-50"
                              } transition-all duration-200`}
                            >
                              {pageNumber}
                            </Button>
                          </Link>
                        );
                      }
                    )}
                  </div>

                  {pagination.page < pagination.totalPages && (
                    <Link
                      to={`?${new URLSearchParams({
                        ...Object.fromEntries(searchParams),
                        page: String(pagination.page + 1),
                      })}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="px-4 py-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200"
                      >
                        Next
                        <span className="ml-1">→</span>
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Column Selector Modal */}
      <ColumnSelectorModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        columns={availableColumns}
        visibleColumns={visibleColumns}
        onColumnChange={updateColumnPreferences}
        onReset={resetColumnPreferences}
        title="Customize Shipment Plans Columns"
      />

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => setIsBulkEditModalOpen(false)}
        selectedIds={selectedIds}
        isSubmitting={isSubmitting}
        dataPoints={dataPoints}
      />
    </AdminLayout>
  );
}
