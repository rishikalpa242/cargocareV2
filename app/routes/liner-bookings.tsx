"use client"

import type React from "react"
import { Form } from "react-router"
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router"
import {
  useLoaderData,
  useNavigate,
  useNavigation,
  redirect,
  useActionData,
  useSearchParams,
  Link,
} from "react-router"
import { requireAuth } from "~/lib/auth.server"
import { prisma } from "~/lib/prisma.server"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { Checkbox } from "~/components/ui/checkbox"
import { AdminLayout } from "~/components/AdminLayout"
import { ColumnSelectorModal } from "~/components/ui/column-selector-modal"
import { useColumnPreferences } from "~/hooks/useColumnPreferences"
import { useState } from "react"
import { json } from "@remix-run/node"

export const meta: MetaFunction = () => {
  return [
    { title: "Liner Bookings - Cargo Care" },
    {
      name: "description",
      content: "Manage liner bookings and carrier details",
    },
  ]
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow LINER_BOOKING_TEAM and ADMIN
    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const url = new URL(request.url)
    const search = url.searchParams.get("search") || ""
    const page = Number.parseInt(url.searchParams.get("page") || "1")
    const limit = Number.parseInt(url.searchParams.get("limit") || "10")
    const offset = (page - 1) * limit
    const tab = url.searchParams.get("tab") || "bookings"

    const whereCondition: any = {}

    if (tab !== "assignments") {
      whereCondition.OR = [
        {
          data: {
            path: ["carrier_booking_status"],
            equals: null,
          },
        },
        {
          data: {
            path: ["carrier_booking_status"],
            equals: "Confirmed",
          },
        },
        {
          data: {
            path: ["carrier_booking_status"],
            equals: "Completed",
          },
        },
        {
          data: {
            path: ["carrier_booking_status"],
            equals: "Cancelled",
          },
        },
        {
          data: {
            path: ["carrier_booking_status"],
            equals: "Ready for Re-linking",
          },
        },
      ]
    }

    // Role-based access control
    console.log("User data:", user.id)
    if (user.role.name !== "ADMIN" && user.role.name !== "MD" && user.role.name !== "LINER_BOOKING_TEAM") {
      whereCondition.assignBookingId = user.id
    } // Search functionality
    if (search) {
      const searchConditions = []

      // NON-ARRAY FIELDS (use Prisma's path syntax - these work fine)
      searchConditions.push(
        // Search in carrier booking status
        {
          data: {
            path: ["carrier_booking_status"],
            string_contains: search,
          },
        },
        // Search in booking released to
        {
          data: {
            path: ["booking_released_to"],
            string_contains: search,
          },
        },
        // Search in unmapping reason
        {
          data: {
            path: ["unmapping_reason"],
            string_contains: search,
          },
        },
        // Search in shipment plan reference number
        {
          shipmentPlan: {
            data: {
              path: ["reference_number"],
              string_contains: search,
            },
          },
        },
        // Search in shipment plan business branch
        {
          shipmentPlan: {
            data: {
              path: ["bussiness_branch"],
              string_contains: search,
            },
          },
        },
        // Search in shipment plan customer
        {
          shipmentPlan: {
            data: {
              path: ["container_movement", "customer"],
              string_contains: search,
            },
          },
        },
        // Search in shipment plan consignee
        {
          shipmentPlan: {
            data: {
              path: ["container_movement", "consignee"],
              string_contains: search,
            },
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
        },
      )

      // ARRAY FIELDS (use raw SQL - these need to be converted)
      try {
        // Dynamically target the correct table for array-field raw SQL searches
        const table = tab === "assignments" ? "shipment_assignments" : "liner_bookings"

        // temporary_booking_number
        const tempBookingMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'temporary_booking_number' ILIKE $1`,
          `%${search}%`,
        )
        if ((tempBookingMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (tempBookingMatches as any[]).map((row: any) => row.id) } })
        }

        // liner_booking_number
        const linerBookingMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'liner_booking_number' ILIKE $1`,
          `%${search}%`,
        )
        if ((linerBookingMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (linerBookingMatches as any[]).map((row: any) => row.id) } })
        }

        // carrier
        const carrierMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'carrier' ILIKE $1`,
          `%${search}%`,
        )
        if ((carrierMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (carrierMatches as any[]).map((row: any) => row.id) } })
        }

        // original_planned_vessel
        const vesselMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'original_planned_vessel' ILIKE $1`,
          `%${search}%`,
        )
        if ((vesselMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (vesselMatches as any[]).map((row: any) => row.id) } })
        }

        // revised_vessel
        const revisedVesselMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'revised_vessel' ILIKE $1`,
          `%${search}%`,
        )
        if ((revisedVesselMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (revisedVesselMatches as any[]).map((row: any) => row.id) } })
        }

        // mbl_number
        const mblMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'mbl_number' ILIKE $1`,
          `%${search}%`,
        )
        if ((mblMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (mblMatches as any[]).map((row: any) => row.id) } })
        }

        // contract
        const contractMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'contract' ILIKE $1`,
          `%${search}%`,
        )
        if ((contractMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (contractMatches as any[]).map((row: any) => row.id) } })
        }

        // equipment_type
        const equipmentTypeMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'equipment_type' ILIKE $1`,
          `%${search}%`,
        )
        if ((equipmentTypeMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (equipmentTypeMatches as any[]).map((row: any) => row.id) } })
        }

        // equipment_quantity
        const equipmentQtyMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'equipment_quantity' ILIKE $1`,
          `%${search}%`,
        )
        if ((equipmentQtyMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (equipmentQtyMatches as any[]).map((row: any) => row.id) } })
        }

        // additional_remarks
        const remarksMatches = await prisma.$queryRawUnsafe(
          `SELECT id FROM "${table}" WHERE data->'liner_booking_details'->0->>'additional_remarks' ILIKE $1`,
          `%${search}%`,
        )
        if ((remarksMatches as any[]).length > 0) {
          searchConditions.push({ id: { in: (remarksMatches as any[]).map((row: any) => row.id) } })
        }
      } catch (error) {
        console.error("Error in raw SQL search:", error)
      }

      whereCondition.OR = searchConditions
    }

    // Assignments branch: query prisma.shipmentAssignment and return same payload shape
    if (tab === "assignments") {
      const [rows, totalCount] = await Promise.all([
        prisma.shipmentAssignment.findMany({
          where: whereCondition,
          include: {
            user: { select: { id: true, name: true, email: true } },
            shipmentPlan: { select: { id: true, data: true, shipmentAssignmentId: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        prisma.shipmentAssignment.count({ where: whereCondition }),
      ])

      return json({
        linerBookings: rows, // keep same key consumed by UI
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        user,
        search,
        tab,
      })
    }

    const [linerBookings, totalCount] = await Promise.all([
      prisma.linerBooking.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          shipmentPlan: {
            select: {
              id: true,
              data: true,
              linerBookingId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.linerBooking.count({ where: whereCondition }),
    ])

    console.log("Liner Bookings - Retrieved count:", totalCount)
    console.log("Liner Bookings - First 5 records (if any):", JSON.stringify(linerBookings.slice(0, 5), null, 2))

    const totalPages = Math.ceil(totalCount / limit)

    return json({
      linerBookings,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      user,
      search,
      tab,
    })
  } catch (error) {
    console.error("Error in loader:", error)
    throw new Response("Internal Server Error", { status: 500 })
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow LINER_BOOKING_TEAM and ADMIN
    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN") {
      return redirect("/dashboard")
    }

    const formData = await request.formData()
    const action = formData.get("action")

    if (action === "delete") {
      const bookingId = formData.get("bookingId") as string

      // Check if user owns this booking or is admin
      const booking = await prisma.linerBooking.findUnique({
        where: { id: bookingId },
      })

      if (!booking) {
        return { error: "Liner booking not found" }
      }

      if (user.role.name !== "ADMIN" && booking.userId !== user.id) {
        return { error: "Unauthorized to delete this liner booking" }
      }

      await prisma.linerBooking.delete({
        where: { id: bookingId },
      })

      return { success: "Liner booking deleted successfully" }
    }

    if (action === "bulkDelete") {
      const selectedIds = formData.getAll("selectedIds") as string[]

      if (selectedIds.length === 0) {
        return { error: "No bookings selected" }
      }

      const whereCondition: any = {
        id: { in: selectedIds },
      }

      // Non-admin users can only delete their own bookings
      if (user.role.name !== "ADMIN") {
        whereCondition.userId = user.id
      }

      const deletedCount = await prisma.linerBooking.deleteMany({
        where: whereCondition,
      })

      return {
        success: `${deletedCount.count} liner booking(s) deleted successfully`,
      }
    }

    // New: support bulk delete for shipment assignments tab
    if (action === "bulkDeleteAssignments") {
      const selectedIds = formData.getAll("selectedIds") as string[]
      if (selectedIds.length === 0) {
        return { error: "No assignments selected" }
      }

      // Non-admin users cannot delete others' assignments if you enforce ownership (optional).
      // Since assignments don't store userId in this file's context, we only gate by role at top.

      const result = await prisma.$transaction(async (tx) => {
        // Unlink assignments from shipment plans before deletion (avoid FK issues)
        await tx.shipmentPlan.updateMany({
          where: { shipmentAssignmentId: { in: selectedIds } },
          data: { shipmentAssignmentId: null },
        })
        const deleted = await tx.shipmentAssignment.deleteMany({
          where: { id: { in: selectedIds } },
        })
        return deleted.count
      })

      return { success: `${result} shipment assignment(s) deleted successfully` }
    }

    return { error: "Invalid action" }
  } catch (error) {
    console.error("Error in liner bookings action:", error)
    return { error: "Failed to perform action" }
  }
}

export default function LinerBookings() {
  const { linerBookings, currentPage, totalPages, totalCount, user, search, tab } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const actionData = useActionData<typeof action>()
  const [searchParams] = useSearchParams()
  const [selectedBookings, setSelectedBookings] = useState<string[]>([])

  const isAssignments = tab === "assignments"

  // Column definitions for the table
  const availableColumns = [
    { id: "checkbox", label: "Select", defaultVisible: true, locked: true },
    { id: "reference_number", label: "Reference No.", defaultVisible: true },
    {
      id: "temp_booking_number",
      label: "Temp. Booking #",
      defaultVisible: true,
    },
    { id: "carrier", label: "Carrier", defaultVisible: true },
    { id: "status", label: "Status", defaultVisible: true },
    { id: "vessel", label: "Vessel", defaultVisible: true },
    { id: "etd", label: "ETD", defaultVisible: true },
    { id: "released_to", label: "Released To", defaultVisible: true },
    {
      id: "liner_booking_number",
      label: "Liner Booking #",
      defaultVisible: true,
    },
    { id: "mbl_number", label: "MBL Number", defaultVisible: true },
    { id: "contract", label: "Contract", defaultVisible: true },
    { id: "equipment_type", label: "Equipment Type", defaultVisible: true },
    { id: "equipment_quantity", label: "Equipment Qty", defaultVisible: true },
    { id: "created_date", label: "Created", defaultVisible: true },
    { id: "created_by", label: "Created By", defaultVisible: true },
    // { id: "actions", label: "Actions", defaultVisible: true, locked: true },
  ]

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
    storageKey: isAssignments ? "shipment-assignments-columns" : "liner-bookings-columns",
    columns: availableColumns,
  })

  const isLoading = navigation.state === "loading" || navigation.state === "submitting"

  const rows =
    availableColumns.length === 0
      ? []
      : isAssignments
        ? linerBookings
        : linerBookings.flatMap((booking: any) => {
            const details = booking?.data?.liner_booking_details || []
            if (!Array.isArray(details) || details.length === 0) {
              return booking
            }
            return details.flatMap((d: any, i: number) => {
              // Expand quantity into individual rows if provided, default to 1
              const qty = Number.parseInt(d?.equipment_quantity || "1") || 1
              return Array.from({ length: qty }, (_, k) => ({
                // clone booking but ensure the UI reads this single detail via [0]
                ...booking,
                id: `${booking.id}#${i}-${k}`, // unique row key while still navigating to original booking
                data: {
                  ...booking.data,
                  liner_booking_details: [d],
                },
                // preserve a pointer to original id for row click navigation if needed
                __originalId: booking.id,
              }))
            })
          })

  const handleRowClick = (id: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    const isInteractiveElement = target.closest('button, a, input, [role="checkbox"]')
    if (!isInteractiveElement) {
      const originalId =
        typeof id === "string" && id.includes("#")
          ? (rows.find((r: any) => r.id === id)?.__originalId ?? id.split("#")[0])
          : id
      const dest = isAssignments
        ? `/liner-bookings/${originalId}/edit?assignmentId=${originalId}`
        : `/liner-bookings/${originalId}/edit`
      console.log("[v0] handleRowClick:", {
        id,
        originalId,
        isAssignments,
        dest,
        pathname: window.location.pathname,
        search: window.location.search,
      })
      navigate(dest)
    }
  }

  const handleSelectBooking = (bookingId: string, checked: boolean) => {
    if (checked) {
      setSelectedBookings([...selectedBookings, bookingId])
    } else {
      setSelectedBookings(selectedBookings.filter((id) => id !== bookingId))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBookings(rows.map((booking: any) => booking.id))
    } else {
      setSelectedBookings([])
    }
  }
  const formatCarrierBookingStatus = (status: string) => {
    return status?.replace(/_/g, " ").toUpperCase() || "N/A"
  }

  const getStatusBadge = (status: string) => {
    return status?.replace(/_/g, " ").toUpperCase() || "N/A"
  }

  const getBookingDetails = (data: any) => {
    const details = data?.liner_booking_details?.[0]
    return {
      temporaryBookingNumber: details?.temporary_booking_number || "N/A",
      carrier: details?.carrier || "N/A",
      vessel: details?.original_planned_vessel || "N/A",
      etd: details?.e_t_d_of_original_planned_vessel || null,
    }
  }

  // Function to get data for a specific column
  const getColumnData = (booking: any, columnId: string) => {
    const details = getBookingDetails(booking.data)

    switch (columnId) {
      case "checkbox":
        return (
          <TableCell key={columnId} className="pl-6">
            <div onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selectedBookings.includes(booking.id)}
                onChange={(e) => handleSelectBooking(booking.id, e.target.checked)}
              />
            </div>
          </TableCell>
        )
      case "reference_number":
        return (
          <TableCell key={columnId} className="font-semibold text-gray-900">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>{booking.shipmentPlan?.data?.reference_number || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "temp_booking_number":
        return (
          <TableCell key={columnId} className="font-semibold text-gray-900">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span>{details.temporaryBookingNumber}</span>
            </div>
          </TableCell>
        )
      case "carrier":
        return (
          <TableCell key={columnId} className="text-gray-700 font-medium">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🏢</span>
              <span>{details.carrier}</span>
            </div>
          </TableCell>
        )
      case "status":
        return <TableCell key={columnId}>{getStatusBadge(booking.data?.carrier_booking_status)}</TableCell>
      case "vessel":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🚢</span>
              <span>{details.vessel}</span>
            </div>
          </TableCell>
        )
      case "etd":
        return (
          <TableCell key={columnId} className="text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📅</span>
              <span>{formatDate(details.etd)}</span>
            </div>
          </TableCell>
        )
      case "released_to":
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">👤</span>
              <span>{booking.data?.booking_released_to || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "liner_booking_number":
        const linerBookingNumber = booking.data?.liner_booking_details?.[0]?.liner_booking_number
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📋</span>
              <span>{linerBookingNumber || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "mbl_number":
        const mblNumber = booking.data?.liner_booking_details?.[0]?.mbl_number
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📄</span>
              <span>{mblNumber || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "contract":
        const contract = booking.data?.liner_booking_details?.[0]?.contract
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📝</span>
              <span>{contract || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "equipment_type":
        const equipmentType = booking.data?.liner_booking_details?.[0]?.equipment_type
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📦</span>
              <span>{equipmentType || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "equipment_quantity":
        const equipmentQuantity = booking.data?.liner_booking_details?.[0]?.equipment_quantity
        return (
          <TableCell key={columnId} className="text-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">#</span>
              <span>{equipmentQuantity || "N/A"}</span>
            </div>
          </TableCell>
        )
      case "created_date":
        return (
          <TableCell key={columnId} className="text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📅</span>
              <span>{formatDate(booking.createdAt)}</span>
            </div>
          </TableCell>
        )
      case "created_by":
        return (
          <TableCell key={columnId} className="text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-gray-600">{booking.user.name.charAt(0).toUpperCase()}</span>
              </div>
              <span>{booking.user.name}</span>
            </div>
          </TableCell>
        )
      case "actions":
        return (
          <TableCell key={columnId} className="pr-6">
            <div className="flex items-center space-x-2">
              {/* Actions column now just shows a hint since row is clickable */}
              <span className="text-gray-400 text-xs italic">Click row to edit</span>
            </div>
          </TableCell>
        )
      default:
        return <TableCell key={columnId}>N/A</TableCell>
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A"
    try {
      return new Date(dateString).toLocaleDateString()
    } catch {
      return "N/A"
    }
  }

  const renderCellContent = (booking: any, columnId: string) => {
    const details = getBookingDetails(booking.data)

    switch (columnId) {
      case "reference_number":
        return booking.shipmentPlan?.data?.reference_number || "N/A"
      case "temp_booking_number":
        return details.temporaryBookingNumber
      case "carrier":
        return details.carrier
      case "status":
        return getStatusBadge(booking.data?.carrier_booking_status)
      case "vessel":
        return details.vessel
      case "etd":
        return formatDate(details.etd)
      case "released_to":
        return booking.data?.booking_released_to || "N/A"
      case "liner_booking_number":
        return booking.data?.liner_booking_details?.[0]?.liner_booking_number || "N/A"
      case "mbl_number":
        return booking.data?.liner_booking_details?.[0]?.mbl_number || "N/A"
      case "contract":
        return booking.data?.liner_booking_details?.[0]?.contract || "N/A"
      case "equipment_type":
        return booking.data?.liner_booking_details?.[0]?.equipment_type || "N/A"
      case "equipment_quantity":
        return booking.data?.liner_booking_details?.[0]?.equipment_quantity || "N/A"
      case "created_date":
        return formatDate(booking.createdAt)
      case "created_by":
        return booking.user.name
      default:
        return "N/A"
    }
  }

  const isSubmitting = navigation.state === "submitting"
  const idsForDelete = Array.from(
    new Set(selectedBookings.map((id) => (typeof id === "string" && id.includes("#") ? id.split("#")[0] : id))),
  )

  return (
    <AdminLayout user={user}>
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {isAssignments ? "Shipment Assignments" : "Available Liner Bookings"}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {isAssignments ? "Manage shipment assignments" : "Manage available liner bookings"}
              </p>
            </div>
            {!isAssignments && (
              <Link to="/liner-bookings/new">
                <Button className="bg-red-500 hover:bg-red-600 text-white">Add New Liner Booking</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {/* Success/Error Messages */}
        {actionData?.success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {actionData.success}
          </div>
        )}
        {actionData?.error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{actionData.error}</div>
        )}

        {/* Enhanced Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 text-2xl">🚢</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {isAssignments ? "Shipment Assignments" : "Available Liner Bookings"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {totalCount} {isAssignments ? "shipment assignments" : "available liner bookings"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsColumnModalOpen(true)}
                  className="px-4 py-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 bg-transparent flex items-center gap-2"
                >
                  <span className="text-sm">⚙️</span>
                  Customize Columns
                </Button>
                <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="font-medium">{totalCount}</span> {isAssignments ? "assignments" : "available"}
                </div>
                {idsForDelete.length > 0 && (
                  <Form method="post">
                    <input type="hidden" name="action" value={isAssignments ? "bulkDeleteAssignments" : "bulkDelete"} />
                    {idsForDelete.map((id) => (
                      <input key={id} type="hidden" name="selectedIds" value={id} />
                    ))}
                    <Button
                      type="submit"
                      className="bg-red-500 hover:bg-red-600 text-white"
                      disabled={isSubmitting}
                      size="sm"
                    >
                      {isSubmitting ? "Deleting..." : "Delete Selected"}
                    </Button>
                  </Form>
                )}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 text-2xl">🚢</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {isAssignments ? "No Shipment Assignments" : "No Available Liner Bookings"}
              </h3>
              <p className="text-gray-500">
                {search
                  ? isAssignments
                    ? `No shipment assignments found matching "${search}"`
                    : `No liner bookings found matching "${search}"`
                  : isAssignments
                    ? "No shipment assignments are currently available."
                    : "No liner bookings are currently available."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gradient-to-r from-slate-50 to-white">
                  <TableRow className="border-gray-200">
                    {visibleColumns.map((columnId) => {
                      const column = availableColumns.find((col) => col.id === columnId)
                      if (!column) return null

                      if (columnId === "checkbox") {
                        return (
                          <TableHead key={columnId} className="w-12 pl-6">
                            <div onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                checked={selectedBookings.length === rows.length && rows.length > 0}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                              />
                            </div>
                          </TableHead>
                        )
                      }

                      return (
                        <TableHead key={columnId} className="font-semibold text-gray-900 text-sm">
                          {column.label}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((booking) => (
                    <TableRow
                      key={booking.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                      onClick={(event) => handleRowClick(booking.id, event)}
                    >
                      {visibleColumns.map((columnId) => getColumnData(booking, columnId))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, totalCount)} of {totalCount}{" "}
                  results
                </div>
                <div className="flex items-center space-x-2">
                  {currentPage > 1 && (
                    <Link
                      to={`/liner-bookings?page=${currentPage - 1}&search=${search}&tab=${tab}`}
                      className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Previous
                    </Link>
                  )}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + Math.max(1, currentPage - 2)
                    if (page > totalPages) return null
                    return (
                      <Link
                        key={page}
                        to={`/liner-bookings?page=${page}&search=${search}&tab=${tab}`}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          page === currentPage
                            ? "text-blue-600 bg-blue-50 border border-blue-300"
                            : "text-gray-500 bg-white border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {page}
                      </Link>
                    )
                  })}
                  {currentPage < totalPages && (
                    <Link
                      to={`/liner-bookings?page=${currentPage + 1}&search=${search}&tab=${tab}`}
                      className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Column Selector Modal */}
      <ColumnSelectorModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        columns={availableColumns}
        visibleColumns={visibleColumns}
        onColumnChange={updateColumnPreferences}
        onReset={resetColumnPreferences}
        title={isAssignments ? "Customize Shipment Assignments Columns" : "Customize Liner Bookings Columns"}
      />
    </AdminLayout>
  )
}
