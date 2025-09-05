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

      const normalizedData = { ...(assignment.data as any) }
      if (assignment.shipmentPlan && assignment.shipmentPlan.linkedStatus === 0) {
        if (Array.isArray(normalizedData.equipment_details) && normalizedData.equipment_details.length > 0) {
          console.log("[v0] loader: clearing stale equipment_details for unlinked assignment", {
            assignmentId,
            equipmentCount: normalizedData.equipment_details.length,
          })
        }
        normalizedData.equipment_details = []
        // liner_booking_details should also be empty post-unlink; keep only if explicitly needed by UI
        if (Array.isArray(normalizedData.liner_booking_details) && normalizedData.liner_booking_details.length > 0) {
          console.log("[v0] loader: clearing stale liner_booking_details for unlinked assignment", {
            assignmentId,
            detailCount: normalizedData.liner_booking_details.length,
          })
        }
        normalizedData.liner_booking_details = []
      }

      const [availableShipmentPlans, carriers, vessels, organizations, equipment, availableLinerBookings] =
        await Promise.all([
          prisma.shipmentPlan.findMany({
            where: { linkedStatus: 0 },
            select: { id: true, data: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.carrier.findMany({ orderBy: { name: "asc" } }),
          prisma.vessel.findMany({ orderBy: { name: "asc" } }),
          prisma.organization.findMany({ orderBy: { name: "asc" } }),
          prisma.equipment.findMany({ orderBy: { name: "asc" } }), // include equipment for edit UI fallback
          prisma.linerBooking.findMany({
            where: {
              OR: [
                { shipmentPlanId: null }, // Available bookings
                { shipmentPlanId: assignment.shipmentPlan?.id }, // Bookings linked to current shipment
              ],
            },
            select: {
              id: true,
              createdAt: true,
              data: true,
              shipmentPlanId: true, // Include to identify linked bookings
              user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          }),
        ])

      let filteredAvailableLinerBookings = availableLinerBookings
      try {
        const planData = (assignment?.shipmentPlan?.data as any) ?? {}
        const requiredEquipmentArr = Array.isArray(planData?.equipment_details) ? planData.equipment_details : []
        const requiredTypes = new Set(
          requiredEquipmentArr
            .map((e: any) => e?.equipment_type)
            .filter((t: any) => typeof t === "string" && t.trim() !== ""),
        )

        const allowedStatuses = new Set([
          "available",
          "ready for re-linking",
          "ready for re‑linking", // include variant with non-breaking hyphen, if present
        ])

        filteredAvailableLinerBookings = availableLinerBookings.filter((b: any) => {
          const statusRaw = (b?.data?.carrier_booking_status ?? "").toString()
  const status = statusRaw.toLowerCase()

  const isLinkedToCurrent = b.shipmentPlanId === assignment.shipmentPlan?.id
  // Only show truly unlinked bookings OR those linked to current assignment
  const statusOk = (b.shipmentPlanId === null && (status === "" || allowedStatuses.has(status))) || isLinkedToCurrent

          if (!statusOk) return false

          if (requiredTypes.size === 0) return true

          const ed: any[] = Array.isArray(b?.data?.equipment_details) ? b.data.equipment_details : []
          const lbd: any[] = Array.isArray(b?.data?.liner_booking_details) ? b.data.liner_booking_details : []

          const typesFromED = ed
            .map((e) => (typeof e?.equipment_type === "string" ? e.equipment_type.trim() : ""))
            .filter((t) => t.length > 0)

          const typesFromLBD = lbd
            .map((d) => (typeof d?.equipment_type === "string" ? d.equipment_type.split("|")[0].trim() : ""))
            .filter((t) => t.length > 0)

          const bookingTypes = new Set<string>([...typesFromED, ...typesFromLBD])

          // Intersect bookingTypes with requiredTypes
          for (const t of bookingTypes) {
            if (requiredTypes.has(t)) return true
          }
          return false
        })
      } catch (e) {
        console.error("[v0] loader: filtering availableLinerBookings by status/type failed", e)
      }

      // Provide linerBooking-like shape for the form
      const linerBooking = {
        ...assignment,
        data: normalizedData,
        shipmentPlan: assignment.shipmentPlan
          ? {
              ...assignment.shipmentPlan,
              linerBookingId: (assignment.shipmentPlan as any).linerBookingId ?? null,
            }
          : null,
      }

      return {
        user,
        linerBooking,
        availableShipmentPlans,
        availableLinerBookings: filteredAvailableLinerBookings, // use filtered list
        isAssignment: true,
        dataPoints: { carriers, vessels, organizations, equipment },
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
    const [availableShipmentPlans, carriers, vessels, organizations, equipment] = await Promise.all([
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
      prisma.equipment.findMany({ orderBy: { name: "asc" } }), // include equipment for edit UI fallback
    ])

    return {
      user,
      linerBooking,
      availableShipmentPlans,
      availableLinerBookings: [],
      isAssignment: false,
      dataPoints: {
        carriers,
        vessels,
        organizations,
        equipment,
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
    const specialAction = (formData.get("_action") as string) || ""

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
        booking_for: (formData.get(`liner_booking_details[${detailIndex}][booking_for]`) as string) || "",
      })
      detailIndex++
    }

    if (assignmentId && specialAction === "unlink_booking") {
      const bookingIdToUnlink = formData.get("bookingId") as string
      if (!bookingIdToUnlink) {
        return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
      }

      console.log("[v0] unlink_booking action started", { bookingIdToUnlink, assignmentId })

      const current = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: { shipmentPlan: true },
      })
      if (!current || !current.shipmentPlan) {
        return Response.json({ error: "Shipment assignment or linked shipment plan not found" }, { status: 404 })
      }

      // Check if assignment is already booked (unlinking not allowed)
      const assignmentData = (current.data as any) || {}
      if (assignmentData.carrier_booking_status === "Booked") {
        return Response.json({ error: "Cannot unlink bookings from a booked assignment" }, { status: 400 })
      }

      // Get the booking to unlink
      const bookingToUnlink = await prisma.linerBooking.findUnique({
        where: { id: bookingIdToUnlink },
      })
      if (!bookingToUnlink) {
        return Response.json({ error: "Booking not found" }, { status: 404 })
      }

      console.log("[v0] unlink_booking - booking found", {
        bookingId: bookingToUnlink.id,
        bookingDetailsCount: ((bookingToUnlink.data as any)?.liner_booking_details || []).length,
      })

      // Remove the booking's details from the assignment's liner_booking_details
      const existingDetails = Array.isArray(assignmentData.liner_booking_details)
        ? assignmentData.liner_booking_details
        : []

      console.log("[v0] unlink_booking - existing details in assignment", {
        existingDetailsCount: existingDetails.length,
        existingDetails: existingDetails.map((d: any) => ({
          temp_booking: d?.temporary_booking_number,
          liner_booking: d?.liner_booking_number,
        })),
      })

      const bookingDetails = ((bookingToUnlink.data as any)?.liner_booking_details || []) as any[]
      const bookingDetailKeys = new Set(
        bookingDetails.map(
          (d: any) => (d?.temporary_booking_number || d?.liner_booking_number || JSON.stringify(d)) as string,
        ),
      )

      console.log("[v0] unlink_booking - booking detail keys to remove", {
        bookingDetailKeys: Array.from(bookingDetailKeys),
        bookingDetailsCount: bookingDetails.length,
      })

      const updatedDetails = existingDetails.filter((detail: any) => {
        const key = (detail?.temporary_booking_number ||
          detail?.liner_booking_number ||
          JSON.stringify(detail)) as string
        const shouldKeep = !bookingDetailKeys.has(key)
        console.log("[v0] unlink_booking - filtering detail", {
          detailKey: key,
          shouldKeep,
          temp_booking: detail?.temporary_booking_number,
          liner_booking: detail?.liner_booking_number,
        })
        return shouldKeep
      })

      console.log("[v0] unlink_booking - after filtering", {
        originalCount: existingDetails.length,
        updatedCount: updatedDetails.length,
        removedCount: existingDetails.length - updatedDetails.length,
      })

      // Transaction: unlink booking and update assignment
      await prisma.$transaction(async (tx) => {
        // Unlink the booking and set status to make it available again
        const bookingData = (bookingToUnlink.data as any) || {}
        await tx.linerBooking.update({
          where: { id: bookingIdToUnlink },
          data: {
            shipmentPlanId: null,
            data: {
              ...bookingData,
              carrier_booking_status: "Ready for Re-linking",
            },
          },
        })

        // Update assignment with filtered details
        await tx.shipmentAssignment.update({
          where: { id: assignmentId },
          data: {
            data: {
              ...assignmentData,
              liner_booking_details: updatedDetails,
            } as any,
          },
        })
      })

      console.log("[v0] unlink_booking - transaction completed, redirecting")

      return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
    }

    if (assignmentId && specialAction === "link_available") {
      const selectedIds = formData.getAll("selectedAvailableIds") as string[]
      if (selectedIds.length === 0) {
        return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
      }

      const current = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: { shipmentPlan: true },
      })
      if (!current || !current.shipmentPlan) {
        return Response.json({ error: "Shipment assignment or linked shipment plan not found" }, { status: 404 })
      }

      // Load the selected liner bookings
      const bookings = await prisma.linerBooking.findMany({
        where: { id: { in: selectedIds } },
      })

      // Merge their details into the assignment's data
      const existingData = ((current.data || {}) as any) ?? {}
      const existingDetails = Array.isArray(existingData.liner_booking_details)
        ? existingData.liner_booking_details
        : []
      const selectedDetails = bookings.flatMap((b) => {
        const d = ((b.data as any)?.liner_booking_details || []) as any[]
        return Array.isArray(d) ? d : []
      })

      // Deduplicate by temporary_booking_number or liner_booking_number
      const seen = new Set<string>()
      const mergedDetails = [...existingDetails]
      for (const d of selectedDetails) {
        const key = (d?.temporary_booking_number || d?.liner_booking_number || JSON.stringify(d)) as string
        if (key && !seen.has(key)) {
          seen.add(key)
          mergedDetails.push(d)
        }
      }

      // Transaction: link bookings to shipment plan, update assignment and mark plan as linked
      // Transaction: link bookings to shipment plan, update assignment and mark plan as linked
await prisma.$transaction(async (tx) => {
  for (const b of bookings) {
    const data = (b.data as any) || {}
    // Ensure the booking data maintains its status when being linked
    await tx.linerBooking.update({
      where: { id: b.id },
      data: {
        shipmentPlanId: current.shipmentPlan!.id,
        data: {
          ...data,
          // Keep existing status unless it's "Ready for Re-linking"
          carrier_booking_status: data.carrier_booking_status === "Ready for Re-linking" 
            ? "Awaiting MD Approval" 
            : (data.carrier_booking_status || "Awaiting MD Approval")
        },
      },
    })
  }

        // Update assignment with merged details (do not force Booked status here)
        await tx.shipmentAssignment.update({
          where: { id: assignmentId },
          data: {
            data: {
              ...(existingData || {}),
              liner_booking_details: mergedDetails,
            } as any,
          },
        })

        // Ensure plan is marked as linked so loader doesn't clear details
        await tx.shipmentPlan.update({
          where: { id: current.shipmentPlan!.id },
          data: {
            linkedStatus: 1,
          },
        })
      })

      return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
    }

    if (assignmentId && specialAction === "allocate_individual") {
      const detailIndex = formData.get("detailIndex") as string
      if (!detailIndex) {
        return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
      }

      console.log("[v0] allocate_individual action started", { assignmentId, detailIndex })

      const current = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: { shipmentPlan: true },
      })
      if (!current || !current.shipmentPlan) {
        return Response.json({ error: "Shipment assignment or linked shipment plan not found" }, { status: 404 })
      }

      // Check if assignment is already booked
      const assignmentData = (current.data as any) || {}
      if (assignmentData.carrier_booking_status === "Booked") {
        return Response.json({ error: "Cannot allocate to a booked assignment" }, { status: 400 })
      }

      // Get the specific booking detail to allocate
      const detailIndexNum = Number.parseInt(detailIndex, 10)
      if (detailIndexNum >= 0 && detailIndexNum < linerBookingDetails.length) {
        const detailToAllocate = linerBookingDetails[detailIndexNum]

        // Update the existing liner_booking_details array or create new one
        const existingDetails = Array.isArray(assignmentData.liner_booking_details)
          ? assignmentData.liner_booking_details
          : []

        // Add the allocated detail (mark it as allocated somehow)
        const updatedDetails = [...existingDetails]
        updatedDetails[detailIndexNum] = { ...detailToAllocate, allocated: true }

        const updatedData = {
          ...assignmentData,
          liner_booking_details: updatedDetails,
        }

        await prisma.shipmentAssignment.update({
          where: { id: assignmentId },
          data: {
            data: updatedData as any,
          },
        })

        console.log("[v0] allocate_individual - allocation completed for detail", detailIndexNum)
      }

      return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
    }

    if (assignmentId && specialAction === "allocate_requested") {
      console.log("[v0] allocate_requested action started", { assignmentId })

      const current = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: { shipmentPlan: true },
      })
      if (!current || !current.shipmentPlan) {
        return Response.json({ error: "Shipment assignment or linked shipment plan not found" }, { status: 404 })
      }

      // Check if assignment is already booked
      const assignmentData = (current.data as any) || {}
      if (assignmentData.carrier_booking_status === "Booked") {
        return Response.json({ error: "Cannot allocate to a booked assignment" }, { status: 400 })
      }

      // Update assignment with the requested booking details
      const updatedData = {
        ...assignmentData,
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

      console.log("[v0] allocate_requested - allocation completed")
      return redirect(`/liner-bookings/${params.id}/edit?assignmentId=${assignmentId}`)
    }

    if (assignmentId) {
      console.log("[v0] action: assignment mode")
      const allBookingAssigned = formData.get("all_booking_assigned") === "true"
      const unmappingButtonClicked = formData.get("request_unmapping") === "true"

      const current = await prisma.shipmentAssignment.findUnique({
        where: { id: assignmentId },
        include: { shipmentPlan: true },
      })
      if (!current) {
        return Response.json({ error: "Shipment assignment not found" }, { status: 404 })
      }

      const existingData = (current.data || {}) as any
      const currentStatus = existingData?.carrier_booking_status || "Awaiting MD Approval"

      const updatedData: any = {
        ...existingData,
        ...(carrier_booking_status ? { carrier_booking_status } : {}),
        ...(typeof unmapping_request === "boolean" ? { unmapping_request } : {}),
        ...(unmapping_reason ? { unmapping_reason } : {}),
        ...(booking_released_to ? { booking_released_to } : {}),
        ...(linerBookingDetails.length > 0 ? { liner_booking_details: linerBookingDetails } : {}),
      }

      if (allBookingAssigned) {
  console.log("[v0] assignment: All Booking Assigned flow")
  updatedData.carrier_booking_status = "Booked"

  console.log("[v0] assignment: updating assignment status to Booked", {
    assignmentId,
    previousStatus: existingData?.carrier_booking_status,
    newStatus: "Booked",
  })

  // Use transaction to ensure all updates happen atomically
  await prisma.$transaction(async (tx) => {
    // Update the assignment
    await tx.shipmentAssignment.update({
      where: { id: assignmentId },
      data: { data: updatedData },
    })

    if (current.shipmentPlan) {
      const spData = ((current.shipmentPlan.data as any) || {}) as any
      const prevStatus = spData.booking_status
      spData.booking_status = "Booked"

      console.log("[v0] assignment: updating shipment plan status", {
        shipmentPlanId: current.shipmentPlan.id,
        previousStatus: prevStatus,
        newStatus: "Booked",
      })

      // Update shipment plan
      await tx.shipmentPlan.update({
        where: { id: current.shipmentPlan.id },
        data: { data: spData, linkedStatus: 1 },
      })

      // Update status of currently linked liner bookings to "Booked" but don't delete them
      // Only update bookings that are actually still linked (shipmentPlanId matches)
      console.log("[v0] assignment: updating linked liner bookings status to Booked", {
        shipmentPlanId: current.shipmentPlan.id,
      })

      const linkedBookingsToUpdate = await tx.linerBooking.findMany({
        where: { shipmentPlanId: current.shipmentPlan.id },
        select: { id: true, data: true }
      })

      console.log("[v0] assignment: found linked bookings to update", {
        count: linkedBookingsToUpdate.length,
        bookingIds: linkedBookingsToUpdate.map(b => b.id)
      })

      // Update each linked booking's status to "Booked"
      for (const booking of linkedBookingsToUpdate) {
        const bookingData = (booking.data as any) || {}
        await tx.linerBooking.update({
          where: { id: booking.id },
          data: {
            data: {
              ...bookingData,
              carrier_booking_status: "Booked",
            },
          },
        })
      }

      console.log("[v0] assignment: linked liner bookings status updated to Booked")
    }
  })

        // DISABLED: Cleanup logic that was incorrectly deleting properly unlinked bookings
        // This logic was intended to clean up "orphaned placeholders" but was actually
        // deleting legitimate unlinked bookings that users want to keep available.
        //
        // The problem: This logic couldn't distinguish between:
        // 1. Legitimate unlinked bookings (user clicked Unlink and wants to keep them available)
        // 2. Temporary placeholder bookings that should be cleaned up
        //
        // Since preserving user data is more important than cleanup, we're disabling this.
        
        console.log("[v0] assignment: skipping cleanup of orphaned bookings to preserve unlinked bookings")
        
        // Future cleanup logic should:
        // 1. Have explicit markers to identify temporary vs. permanent bookings
        // 2. Require user confirmation before deletion
        // 3. Run as a separate maintenance process, not during normal operations

        console.log("[v0] assignment: All Booking Assigned flow completed, redirecting")
        return redirect("/liner-bookings?tab=assignments")
      }

      // Request Unmapping flow (mirror liner-booking behavior)
      if ((unmapping_request || unmappingButtonClicked) && currentStatus === "Booked") {
        if (!unmapping_reason || unmapping_reason.trim() === "") {
          return Response.json({ error: "Unmapping reason is required" }, { status: 400 })
        }

        console.log("[v0] assignment: Request Unmapping from Booked")
        updatedData.carrier_booking_status = "Unmapping Requested"

        await prisma.shipmentAssignment.update({
          where: { id: assignmentId },
          data: { data: updatedData },
        })

        if (current.shipmentPlan) {
          const spData = ((current.shipmentPlan.data as any) || {}) as any
          const prevStatus = spData.booking_status
          spData.booking_status = "Unmapping Requested"
          await prisma.shipmentPlan.update({
            where: { id: current.shipmentPlan.id },
            data: { data: spData },
          })
          console.log("[v0] assignment: updated shipmentPlan unmapping", {
            shipmentPlanId: current.shipmentPlan.id,
            prevStatus,
            newStatus: spData.booking_status,
          })
        }

        return redirect("/liner-bookings?tab=assignments")
      }

      // No special flow: keep current status
      updatedData.carrier_booking_status = currentStatus
      await prisma.shipmentAssignment.update({
        where: { id: assignmentId },
        data: { data: updatedData },
      })
      console.log("[v0] assignment: regular update", { status: updatedData.carrier_booking_status })

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

      // DISABLED: Clean up logic that was incorrectly deleting properly unlinked bookings
      // The issue was that this logic couldn't distinguish between:
      // 1. Legitimate unlinked bookings that users want to keep available
      // 2. Actual duplicate temporary bookings that should be cleaned up
      //
      // Since unlinked bookings should remain available for re-use, we're disabling
      // this cleanup logic to prevent accidental deletion of user data.
      
      console.log("Skipping cleanup of temporary bookings to preserve unlinked bookings")
      
      // If cleanup becomes necessary in the future, it should be implemented with:
      // 1. More specific criteria to identify true duplicates vs. legitimate unlinked bookings
      // 2. User confirmation before deletion
      // 3. A separate cleanup process that doesn't run during normal operations

      // Update status of other linked liner bookings to "Booked" but don't delete them
      if (updatedLinerBooking.shipmentPlan) {
        const otherLinkedBookings = await prisma.linerBooking.findMany({
          where: {
            shipmentPlanId: updatedLinerBooking.shipmentPlan.id,
            id: { not: id }, // Exclude the current liner booking
          },
        })

        if (otherLinkedBookings.length > 0) {
          console.log(`Found ${otherLinkedBookings.length} other linked liner bookings to update status`)

          // Update each booking's status to "Booked"
          for (const booking of otherLinkedBookings) {
            const bookingData = (booking.data as any) || {}
            await prisma.linerBooking.update({
              where: { id: booking.id },
              data: {
                data: {
                  ...bookingData,
                  carrier_booking_status: "Booked",
                },
              },
            })
          }

          console.log("Other linked liner bookings status updated to Booked")
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
  const { user, linerBooking, availableShipmentPlans, dataPoints, availableLinerBookings, isAssignment } =
    useLoaderData<typeof loader>()
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
        availableLinerBookings={availableLinerBookings}
        isAssignment={isAssignment}
      />
    </AdminLayout>
  )
}
