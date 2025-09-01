import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router"
import { useLoaderData, useActionData, redirect } from "react-router"
import { requireAuth } from "~/lib/auth.server"
import { prisma } from "~/lib/prisma.server"
import { AdminLayout } from "~/components/AdminLayout"
import { LinerBookingForm } from "~/components/LinerBookingForm"

export const meta: MetaFunction = () => {
  return [
    { title: "Edit Shipment Assignment - Cargo Care" },
    { name: "description", content: "Edit shipment assignment details" },
  ]
}

async function handleFileUpload(file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === "string") {
    return typeof file === "string" ? file : null
  }

  const uploadedFile = file as File
  if (uploadedFile.size === 0) return null

  // Dynamically import Node modules on the server only
  const [{ default: fs }, { default: path }] = await Promise.all([import("fs/promises"), import("path")])

  const uploadDir = path.join(process.cwd(), "public", "uploads", "liner-booking-pdfs")
  await fs.mkdir(uploadDir, { recursive: true })

  const uniqueFilename = `${Date.now()}-${uploadedFile.name}`
  const filePath = path.join(uploadDir, uniqueFilename)

  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer())
  await fs.writeFile(filePath, fileBuffer)

  return `/uploads/liner-booking-pdfs/${uniqueFilename}`
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request)

    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const { id } = params
    if (!id) throw new Response("Shipment assignment ID is required", { status: 400 })

    console.log("[v0] shipment-assignments loader start", { id, url: request.url, userId: user.id })

    const assignment = await prisma.shipmentAssignment.findUnique({
      where: { id },
      include: {
        user: true,
        shipmentPlan: {
          select: {
            id: true,
            data: true,
            shipmentAssignmentId: true,
          },
        },
      },
    })

    if (!assignment) {
      console.error("[v0] shipment-assignments loader: assignment not found", { id })
      throw new Response("Shipment assignment not found", { status: 404 })
    }

    // Some parts of the form may check shipmentPlan.linerBookingId; provide a safe alias.
    const linerBookingShape = {
      ...assignment,
      shipmentPlan: {
        ...assignment.shipmentPlan,
        // Provide an alias for compatibility; not persisted, only for UI checks.
        linerBookingId: (assignment as any).shipmentPlan?.linerBookingId ?? assignment.id,
      },
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

    console.log("[v0] shipment-assignments loader success", {
      id: assignment.id,
      hasPlan: !!assignment.shipmentPlan,
      carriers: carriers.length,
      vessels: vessels.length,
      organizations: organizations.length,
      availablePlans: availableShipmentPlans.length,
    })

    return {
      user,
      linerBooking: linerBookingShape,
      availableShipmentPlans,
      dataPoints: { carriers, vessels, organizations },
      context: "shipment-assignment",
    }
  } catch (error) {
    console.error("[v0] Error loading shipment assignment:", error)
    if (error instanceof Response) throw error
    return redirect("/login")
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request)
    if (user.role.name !== "LINER_BOOKING_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const { id } = params
    if (!id) return Response.json({ error: "Shipment assignment ID is required" }, { status: 400 })

    const formData = await request.formData()

    const carrier_booking_status = (formData.get("current_status") as string) || undefined
    const unmapping_request =
      formData.get("unmapping_request") === "true" || formData.get("unmapping_request") === "on" || undefined
    const unmapping_reason = (formData.get("unmapping_reason") as string) || undefined
    const booking_released_to = (formData.get("booking_released_to") as string) || undefined

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

    const current = await prisma.shipmentAssignment.findUnique({ where: { id } })
    if (!current) return Response.json({ error: "Shipment assignment not found" }, { status: 404 })
    const existingData = (current.data || {}) as any

    const updatedData = {
      ...existingData,
      ...(carrier_booking_status !== undefined ? { carrier_booking_status } : {}),
      ...(unmapping_request !== undefined ? { unmapping_request } : {}),
      ...(unmapping_reason !== undefined ? { unmapping_reason } : {}),
      ...(booking_released_to !== undefined ? { booking_released_to } : {}),
      ...(linerBookingDetails.length > 0 ? { liner_booking_details: linerBookingDetails } : {}),
    }

    await prisma.shipmentAssignment.update({
      where: { id },
      data: { data: updatedData },
    })

    return redirect("/liner-bookings?tab=assignments")
  } catch (error) {
    console.error("Error updating shipment assignment:", error)
    return Response.json({ error: "Failed to update shipment assignment" }, { status: 500 })
  }
}

export default function EditShipmentAssignmentPage() {
  const { user, linerBooking, availableShipmentPlans, dataPoints } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()

  console.log("[v0] EditShipmentAssignmentPage render", {
    linerBookingId: linerBooking?.id,
    hasPlan: !!linerBooking?.shipmentPlan,
    userId: user?.id,
  })

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
