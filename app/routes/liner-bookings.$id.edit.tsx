import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router"
import { useLoaderData, redirect, useActionData } from "react-router"
import { requireAuth } from "~/lib/auth.server"
import { prisma } from "~/lib/prisma.server"
import { AdminLayout } from "~/components/AdminLayout"
import { LinerBookingForm } from "~/components/LinerBookingForm"

export const meta: MetaFunction = () => {
  return [{ title: "Edit Liner Booking - Cargo Care" }, { name: "description", content: "Edit liner booking details" }]
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow LINER_BOOKING_TEAM and ADMIN
    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const { id } = params
    if (!id) {
      throw new Response("Liner booking ID is required", { status: 400 })
    }

    const url = new URL(request.url)
    const assignmentId = url.searchParams.get("assignmentId")

    // If assignmentId present, load shipment assignment and map to form shape
    if (assignmentId) {
      console.log("[v0] loader: assignment mode", { id, assignmentId })

      const assignment = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          user: true,
          shipmentPlan: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      })

      if (!assignment) {
        throw new Response("Shipment assignment not found", { status: 404 })
      }

      const [availableShipmentPlans, carriers, vessels, organizations] = await Promise.all([
        prisma.shipmentPlan.findMany({
          where: { linkedStatus: 0 },
          select: { id: true, data: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.carrier.findMany({ orderBy: { name: "asc" } }),
        prisma.vessel.findMany({ orderBy: { name: "asc" } }),
        prisma.organization.findMany({ orderBy: { name: "asc" } }),
      ])

      // Provide linerBooking-like shape for the form
      const linerBooking = {
        ...assignment,
        shipmentPlan: assignment.shipmentPlan
          ? {
              ...assignment.shipmentPlan,
              // alias for any conditional checks in form code
              linerBookingId: (assignment.shipmentPlan as any).linerBookingId ?? null,
            }
          : null,
      }

      return {
        user,
        linerBooking,
        availableShipmentPlans,
        dataPoints: { carriers, vessels, organizations },
      }
    }

    const linerBooking = await prisma.linerBooking.findUnique({
      where: { id },
      include: {
        user: true,
        shipmentPlan: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!linerBooking) {
      throw new Response("Liner booking not found", { status: 404 })
    }

    // Fetch available shipment plans for linking (only those without existing liner bookings)
    const [availableShipmentPlans, carriers, vessels, organizations] = await Promise.all([
      prisma.shipmentPlan.findMany({
        where: {
          linkedStatus: 0, // Only unlinked plans
        },
        select: {
          id: true,
          data: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.carrier.findMany({ orderBy: { name: "asc" } }),
      prisma.vessel.findMany({ orderBy: { name: "asc" } }),
      prisma.organization.findMany({ orderBy: { name: "asc" } }),
    ])

    return {
      user,
      linerBooking,
      availableShipmentPlans,
      dataPoints: {
        carriers,
        vessels,
        organizations,
      },
    }
  } catch (error) {
    console.error("Error loading liner booking:", error)
    if (error instanceof Response) {
      throw error
    }
    return redirect("/login")
  }
}

// This function handles saving the uploaded file to your server
async function handleFileUpload(file: FormDataEntryValue | null): Promise<string | null> {
  console.log("[v0] handleFileUpload called:", { hasFile: !!file, type: typeof file })

  if (!file || typeof file === "string") {
    console.log("[v0] handleFileUpload early return:", typeof file === "string" ? "string path" : "null")
    return typeof file === "string" ? file : null
  }

  const uploadedFile = file as File
  if (uploadedFile.size === 0) {
    console.log("[v0] handleFileUpload empty file")
    return null
  }

  const [{ default: fs }, { default: path }] = await Promise.all([import("fs/promises"), import("path")])

  const uploadDir = path.join(process.cwd(), "public", "uploads", "liner-booking-pdfs")
  await fs.mkdir(uploadDir, { recursive: true })

  const uniqueFilename = `${Date.now()}-${uploadedFile.name}`
  const filePath = path.join(uploadDir, uniqueFilename)

  console.log("[v0] handleFileUpload saving to:", filePath)

  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer())
  await fs.writeFile(filePath, fileBuffer)

  return `/uploads/liner-booking-pdfs/${uniqueFilename}`
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow LINER_BOOKING_TEAM and ADMIN
    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN") {
      return redirect("/dashboard")
    }

    const { id } = params
    if (!id) {
      return Response.json({ error: "Liner booking ID is required" }, { status: 400 })
    }

    const url = new URL(request.url)
    const assignmentId = url.searchParams.get("assignmentId")
    const formData = await request.formData()

    // Parse common fields and details (shared by both flows)
    const carrier_booking_status = formData.get("current_status") as string
    const unmapping_request = formData.get("unmapping_request") === "true" || formData.get("unmapping_request") === "on"
    const unmapping_reason = formData.get("unmapping_reason") as string
    const booking_released_to = formData.get("booking_released_to") as string

    const linerBookingDetails: any[] = []
    let detailIndex = 0
    while (formData.get(`liner_booking_details[${detailIndex}][temporary_booking_number]`) !== null) {
      const etdOriginal = formData.get(
        `liner_booking_details[${detailIndex}][e_t_d_of_original_planned_vessel]`,
      ) as string
      const etdRevised = formData.get(`liner_booking_details[${detailIndex}][etd_of_revised_vessel]`) as string
      const emptyPickupFrom = formData.get(
        `liner_booking_details[${detailIndex}][empty_pickup_validity_from]`,
      ) as string
      const emptyPickupTill = formData.get(
        `liner_booking_details[${detailIndex}][empty_pickup_validity_till]`,
      ) as string
      const gateOpeningDate = formData.get(
        `liner_booking_details[${detailIndex}][estimate_gate_opening_date]`,
      ) as string
      const gateCutoffDate = formData.get(`liner_booking_details[${detailIndex}][estimated_gate_cutoff_date]`) as string
      const siCutoffDate = formData.get(`liner_booking_details[${detailIndex}][s_i_cut_off_date]`) as string
      const bookingReceivedDate = formData.get(
        `liner_booking_details[${detailIndex}][booking_received_from_carrier_on]`,
      ) as string

      linerBookingDetails.push({
        temporary_booking_number: formData.get(
          `liner_booking_details[${detailIndex}][temporary_booking_number]`,
        ) as string,
        suffix_for_anticipatory_temporary_booking_number: formData.get(
          `liner_booking_details[${detailIndex}][suffix_for_anticipatory_temporary_booking_number]`,
        ) as string,
        liner_booking_number: formData.get(`liner_booking_details[${detailIndex}][liner_booking_number]`) as string,
        mbl_number: formData.get(`liner_booking_details[${detailIndex}][mbl_number]`) as string,
        carrier: formData.get(`liner_booking_details[${detailIndex}][carrier]`) as string,
        contract: (formData.get(`liner_booking_details[${detailIndex}][contract]`) as string) || null,
        original_planned_vessel: formData.get(
          `liner_booking_details[${detailIndex}][original-planned_vessel]`,
        ) as string,
        e_t_d_of_original_planned_vessel: etdOriginal ? new Date(etdOriginal).toISOString() : null,
        change_in_original_vessel:
          formData.get(`liner_booking_details[${detailIndex}][change_in_original_vessel]`) === "true",
        revised_vessel: formData.get(`liner_booking_details[${detailIndex}][revised_vessel]`) as string,
        etd_of_revised_vessel: etdRevised ? new Date(etdRevised).toISOString() : null,
        empty_pickup_validity_from: emptyPickupFrom ? new Date(emptyPickupFrom).toISOString() : null,
        empty_pickup_validity_till: emptyPickupTill ? new Date(emptyPickupTill).toISOString() : null,
        estimate_gate_opening_date: gateOpeningDate ? new Date(gateOpeningDate).toISOString() : null,
        estimated_gate_cutoff_date: gateCutoffDate ? new Date(gateCutoffDate).toISOString() : null,
        s_i_cut_off_date: siCutoffDate ? new Date(siCutoffDate).toISOString() : null,
        booking_received_from_carrier_on: bookingReceivedDate ? new Date(bookingReceivedDate).toISOString() : null,
        additional_remarks: formData.get(`liner_booking_details[${detailIndex}][additional_remarks]`) as string,
        line_booking_copy: formData.get(`liner_booking_details[${detailIndex}][line_booking_copy]`) as string,
        line_booking_copy_file: await handleFileUpload(
          formData.get(`liner_booking_details[${detailIndex}][line_booking_copy_file]`),
        ),
        equipment_type: (formData.get(`liner_booking_details[${detailIndex}][equipment_type]`) as string) || "",
        equipment_quantity: (formData.get(`liner_booking_details[${detailIndex}][equipment_quantity]`) as string) || "",
      })
      detailIndex++
    }

    // Assignment mode: update shipment_assignments and exit
    if (assignmentId) {
      console.log("[v0] action: assignment mode", { id, assignmentId })

      const current = await prisma.shipmentAssignment.findUnique({ where: { id: assignmentId } })
      if (!current) {
        return Response.json({ error: "Shipment assignment not found" }, { status: 404 })
      }

      const existingData = (current.data || {}) as any
      const updatedData = {
        ...existingData,
        ...(carrier_booking_status ? { carrier_booking_status } : {}),
        ...(typeof unmapping_request === "boolean" ? { unmapping_request } : {}),
        ...(unmapping_reason ? { unmapping_reason } : {}),
        ...(booking_released_to ? { booking_released_to } : {}),
        ...(linerBookingDetails.length > 0 ? { liner_booking_details: linerBookingDetails } : {}),
      }

      await prisma.shipmentAssignment.update({
        where: { id: assignmentId },
        data: { data: updatedData },
      })

      return redirect("/liner-bookings?tab=assignments")
    }

    const linerBookingData = {
      carrier_booking_status,
      unmapping_request,
      unmapping_reason,
      booking_released_to,
      liner_booking_details: linerBookingDetails,
    }

    // Check if the "All Booking Assigned" button was clicked
    const allBookingAssigned = formData.get("all_booking_assigned") === "true"

    console.log("All Booking Assigned button clicked:", allBookingAssigned)

    if (allBookingAssigned) {
      console.log("Processing 'All Booking Assigned' workflow...")
      // Update both liner booking and shipment plan statuses to "Booked"
      linerBookingData.carrier_booking_status = "Booked"

      // Update the liner booking
      const updatedLinerBooking = await prisma.linerBooking.update({
        where: { id },
        data: {
          data: linerBookingData,
        },
        include: {
          shipmentPlan: true,
        },
      })

      console.log("Liner booking updated. Has shipment plan:", !!updatedLinerBooking.shipmentPlan)

      // Clean up orphaned "Ready for Re-linking" entries that match this booking's equipment
      const currentData = updatedLinerBooking.data as any
      if (currentData.liner_booking_details && Array.isArray(currentData.liner_booking_details)) {
        // Find all "Ready for Re-linking" entries with matching equipment details
        const orphanedBookings = await prisma.linerBooking.findMany({
          where: {
            shipmentPlanId: null, // Unlinked entries
            id: { not: id }, // Exclude current booking
          },
        })

        // Filter orphaned bookings that have matching equipment details
        const bookingsToDelete = orphanedBookings.filter((orphanedBooking) => {
          const orphanedData = orphanedBooking.data as any
          return (
            orphanedData.carrier_booking_status === "Ready for Re-linking" &&
            orphanedData.liner_booking_details &&
            Array.isArray(orphanedData.liner_booking_details) &&
            orphanedData.liner_booking_details.some((orphanedDetail: any) =>
              currentData.liner_booking_details.some(
                (currentDetail: any) =>
                  orphanedDetail.temporary_booking_number === currentDetail.temporary_booking_number ||
                  orphanedDetail.liner_booking_number === currentDetail.liner_booking_number,
              ),
            )
          )
        })

        if (bookingsToDelete.length > 0) {
          console.log(`Found ${bookingsToDelete.length} orphaned "Ready for Re-linking" entries to delete`)

          await prisma.linerBooking.deleteMany({
            where: {
              id: { in: bookingsToDelete.map((booking) => booking.id) },
            },
          })

          console.log("Orphaned Ready for Re-linking entries deleted successfully")
        }
      }

      // Delete duplicate liner bookings with the same shipmentPlanId
      if (updatedLinerBooking.shipmentPlan) {
        const duplicateLinerBookings = await prisma.linerBooking.findMany({
          where: {
            shipmentPlanId: updatedLinerBooking.shipmentPlan.id,
            id: { not: id }, // Exclude the current liner booking
          },
        })

        if (duplicateLinerBookings.length > 0) {
          console.log(`Found ${duplicateLinerBookings.length} duplicate liner bookings to delete`)

          await prisma.linerBooking.deleteMany({
            where: {
              shipmentPlanId: updatedLinerBooking.shipmentPlan.id,
              id: { not: id }, // Exclude the current liner booking
            },
          })

          console.log("Duplicate liner bookings deleted successfully")
        }
      }

      // Update the linked shipment plan status if it exists
      if (updatedLinerBooking.shipmentPlan) {
        const shipmentPlanData = updatedLinerBooking.shipmentPlan.data as any
        console.log("Original shipment plan status:", shipmentPlanData.booking_status)
        shipmentPlanData.booking_status = "Booked"
        console.log("Setting shipment plan status to:", shipmentPlanData.booking_status)

        const updatedShipmentPlan = await prisma.shipmentPlan.update({
          where: { id: updatedLinerBooking.shipmentPlan.id },
          data: {
            data: shipmentPlanData,
            linkedStatus: 1,
          },
        })

        console.log("Shipment plan updated successfully:", updatedShipmentPlan.id)
      } else {
        console.log("No linked shipment plan found")
      }
    } else {
      // Get current liner booking to check actual status
      const currentLinerBooking = await prisma.linerBooking.findUnique({
        where: { id },
        include: { shipmentPlan: true },
      })

      if (!currentLinerBooking) {
        return Response.json({ error: "Liner booking not found" }, { status: 404 })
      }

      const currentData = currentLinerBooking.data as any
      const currentStatus = currentData?.carrier_booking_status || "Awaiting MD Approval"

      console.log("=== UNMAPPING DEBUG ===")
      console.log("unmapping_request from form:", unmapping_request)
      console.log("currentStatus:", currentStatus)
      console.log("unmapping_reason:", unmapping_reason)
      console.log("=== END UNMAPPING DEBUG ===")

      // Check if unmapping was requested via the "Request Unmapping" button
      if (unmapping_request && currentStatus === "Booked") {
        // Validate that unmapping reason is provided
        if (!unmapping_reason || unmapping_reason.trim() === "") {
          return Response.json({ error: "Unmapping reason is required" }, { status: 400 })
        }

        console.log("Unmapping requested via button - updating status from Booked to Unmapping Requested")
        linerBookingData.carrier_booking_status = "Unmapping Requested"

        // Also update the linked shipment plan status to reflect unmapping request
        if (currentLinerBooking.shipmentPlan) {
          const shipmentPlanData = currentLinerBooking.shipmentPlan.data as any
          shipmentPlanData.booking_status = "Unmapping Requested"

          await prisma.shipmentPlan.update({
            where: { id: currentLinerBooking.shipmentPlan.id },
            data: {
              data: shipmentPlanData,
            },
          })
          console.log("Updated shipment plan status to Unmapping Requested")
        }
      } else {
        console.log("No unmapping request or status not Booked - keeping current status:", currentStatus)
        // Keep the current status if no special action
        linerBookingData.carrier_booking_status = currentStatus
      }

      // Regular update
      await prisma.linerBooking.update({
        where: { id },
        data: {
          data: linerBookingData,
        },
      })
    }

    return redirect("/liner-bookings")
  } catch (error) {
    console.error("Error updating liner booking:", error)
    return Response.json({ error: "Failed to update liner booking" }, { status: 500 })
  }
}

export default function EditLinerBookingPage() {
  const { user, linerBooking, availableShipmentPlans, dataPoints } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()

  return (
    <AdminLayout user={user}>
      <LinerBookingForm
        mode="edit"
        linerBooking={linerBooking}
        availableShipmentPlans={availableShipmentPlans}
        dataPoints={dataPoints}
        actionData={actionData}
        user={user}
      />
    </AdminLayout>
  )
}
