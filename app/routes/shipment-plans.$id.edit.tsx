import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router"
import { useLoaderData, useNavigation, redirect, useActionData, Link } from "react-router"
import { requireAuth } from "~/lib/auth.server"
import { prisma } from "~/lib/prisma.server"
import { AdminLayout } from "~/components/AdminLayout"
import { ShipmentPlanForm } from "~/components/ShipmentPlanForm"

export const meta: MetaFunction = () => {
  return [{ title: "Edit Shipment Plan - Cargo Care" }, { name: "description", content: "Edit shipment plan" }]
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow SHIPMENT_PLAN_TEAM and ADMIN
    if (user.role.name !== "SHIPMENT_PLAN_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const planId = params.id
    if (!planId) {
      return redirect("/shipment-plans")
    }
    const shipmentPlan = await prisma.shipmentPlan.findUnique({
      where: { id: planId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        linerBooking: {
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

    if (!shipmentPlan) {
      return redirect("/shipment-plans")
    } // Check permissions
    if (user.role.name !== "ADMIN" && user.role.name !== "MD" && shipmentPlan.userId !== user.id) {
      return redirect("/shipment-plans")
    }

    // Fetch data points for dropdowns
    const [
      businessBranches,
      commodities,
      equipment,
      loadingPorts,
      portsOfDischarge,
      destinationCountries,
      vessels,
      carriers,
      organizations,
      linerBookingUsers,
    ] = await Promise.all([
      prisma.businessBranch.findMany({ orderBy: { name: "asc" } }),
      prisma.commodity.findMany({ orderBy: { name: "asc" } }),
      prisma.equipment.findMany({ orderBy: { name: "asc" } }),
      prisma.loadingPort.findMany({ orderBy: { name: "asc" } }),
      prisma.portOfDischarge.findMany({ orderBy: { name: "asc" } }),
      prisma.destinationCountry.findMany({ orderBy: { name: "asc" } }),
      prisma.vessel.findMany({ orderBy: { name: "asc" } }),
      prisma.carrier.findMany({ orderBy: { name: "asc" } }),
      prisma.organization.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({
        where: {
          role: {
            name: "LINER_BOOKING_TEAM",
          },
        },
        include: {
          role: true,
          businessBranch: true, // include business branch info
        },
        orderBy: {
          name: "asc",
        },
      }),
    ])

    return {
      user,
      shipmentPlan,
      dataPoints: {
        businessBranches,
        commodities,
        equipment,
        loadingPorts,
        portsOfDischarge,
        destinationCountries,
        vessels,
        carriers,
        organizations,
        linerBookingUsers,
      },
    }
  } catch (error) {
    return redirect("/login")
  }
}

// Helper function to generate equipment code based on equipment type - Updated with your specifications
function generateEquipmentCode(equipmentType: string) {
  if (!equipmentType) return "EQP"

  const type = equipmentType.toLowerCase()

  // Standard containers
  if (type.includes("20ft standard container") || type.includes("20' standard container")) return "20SC"
  if (type.includes("40ft standard container") || type.includes("40' standard container")) return "40SC"

  // High Cube containers
  if (type.includes("40ft high cube container") || type.includes("40' high cube container")) return "40HCC"
  if (type.includes("45ft high cube container") || type.includes("45' high cube container")) return "45HCC"

  // Refrigerated containers
  if (type.includes("20ft refrigerated container") || type.includes("20' refrigerated container")) return "20RC"
  if (type.includes("40ft refrigerated container") || type.includes("40' refrigerated container")) return "40RC"

  // Open Top containers
  if (type.includes("20ft open top container") || type.includes("20' open top container")) return "20OTC"
  if (type.includes("40ft open top container") || type.includes("40' open top container")) return "40OTC"

  // Flat Rack containers
  if (type.includes("20ft flat rack container") || type.includes("20' flat rack container")) return "20FRC"
  if (type.includes("40ft flat rack container") || type.includes("40' flat rack container")) return "40FRC"

  // Tank containers
  if (type.includes("20ft tank container") || type.includes("20' tank container")) return "20TC"
  if (type.includes("40ft tank container") || type.includes("40' tank container")) return "40TC"

  // Special containers
  if (type.includes("platform container")) return "PC"
  if (type.includes("bulk container")) return "BC"
  if (type.includes("ventilated container")) return "VC"
  if (type.includes("insulated container")) return "IC"
  if (type.includes("hard top container")) return "HTC"
  if (type.includes("side door container")) return "SDC"
  if (type.includes("double door container")) return "DDC"
  if (type.includes("thermal container")) return "TC"

  // Generic 20ft containers (fallback)
  if (type.includes("20ft") || type.includes("20'")) {
    if (type.includes("dry")) return "20SC"
    if (type.includes("reefer")) return "20RC"
    return "20SC" // Default 20ft to Standard Container
  }

  // Generic 40ft containers (fallback)
  if (type.includes("40ft") || type.includes("40'")) {
    if (type.includes("dry")) return "40SC"
    if (type.includes("reefer")) return "40RC"
    if (type.includes("high cube") || type.includes("hc")) return "40HCC"
    return "40SC" // Default 40ft to Standard Container
  }

  // Generic 45ft containers (fallback)
  if (type.includes("45ft") || type.includes("45'")) {
    return "45HCC" // Default 45ft to High Cube Container
  }

  // Special equipment (fallback)
  if (type.includes("lcl")) return "LCL"
  if (type.includes("break bulk")) return "BB"
  if (type.includes("roro")) return "RORO"

  // Ultimate fallback - use first 3-5 characters, uppercase, alphanumeric only
  return equipmentType
    .substring(0, 5)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .padEnd(3, "X")
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const user = await requireAuth(request)

    // Only allow SHIPMENT_PLAN_TEAM and ADMIN
    if (user.role.name !== "SHIPMENT_PLAN_TEAM" && user.role.name !== "ADMIN" && user.role.name !== "MD") {
      return redirect("/dashboard")
    }

    const planId = params.id
    if (!planId) {
      return redirect("/shipment-plans")
    }

    // Check if the plan exists and user has permission
    const existingPlan = await prisma.shipmentPlan.findUnique({
      where: { id: planId },
    })

    if (!existingPlan) {
      return { error: "Shipment plan not found" }
    }

    if (user.role.name !== "ADMIN" && user.role.name !== "MD" && existingPlan.userId !== user.id) {
      return { error: "You don't have permission to edit this shipment plan" }
    }
    const formData = await request.formData()

    // Check if unmapping approval or rejection was requested
    const approveUnmapping = formData.get("approve_unmapping") === "true"
    const rejectUnmapping = formData.get("reject_unmapping") === "true"

    if (approveUnmapping) {
      // Handle unmapping approval - unlink the records and update statuses
      const currentPlan = await prisma.shipmentPlan.findUnique({
        where: { id: planId },
        include: { linerBooking: true },
      })

      if (currentPlan?.linerBooking) {
        const originalLinerBooking = currentPlan.linerBooking
        const originalLinerBookingData = originalLinerBooking.data as any
        const shipmentPlanData = currentPlan.data as any

        if (shipmentPlanData.equipment_details && Array.isArray(shipmentPlanData.equipment_details)) {
          for (let i = 0; i < shipmentPlanData.equipment_details.length; i++) {
            const equipment = shipmentPlanData.equipment_details[i]

            // Find the corresponding liner booking detail for this equipment
            let correspondingLinerBookingDetail = null
            if (
              originalLinerBookingData.liner_booking_details &&
              Array.isArray(originalLinerBookingData.liner_booking_details)
            ) {
              // Try to match by tracking number or use index as fallback
              correspondingLinerBookingDetail =
                originalLinerBookingData.liner_booking_details.find(
                  (detail: any) => detail.trackingNumber === equipment.trackingNumber,
                ) ||
                originalLinerBookingData.liner_booking_details[i] ||
                originalLinerBookingData.liner_booking_details[0]
            }

            await prisma.linerBooking.create({
              data: {
                data: {
                  ...originalLinerBookingData,
                  carrier_booking_status: "Ready for Re-linking",
                  // Override equipment details to contain only this single equipment
                  equipment_details: [equipment], // Single equipment per booking
                  // Override liner booking details to contain only the corresponding detail
                  liner_booking_details: correspondingLinerBookingDetail ? [correspondingLinerBookingDetail] : [],
                  // Ensure unmapping flags are reset for the new booking
                  unmapping_request: false,
                  unmapping_reason: "",
                },
                userId: originalLinerBooking.userId,
                assignBookingId: originalLinerBooking.assignBookingId,
                // The new cloned booking is not linked to any shipment plan yet
                shipmentPlanId: null, // Not linked to any shipment plan initially
              },
            })
          }
        }

        // Update original liner booking status
        await prisma.linerBooking.update({
          where: { id: originalLinerBooking.id },
          data: {
            data: {
              ...originalLinerBookingData,
              carrier_booking_status: "Awaiting Booking",
              unmapping_request: false,
              unmapping_reason: "",
            },
            shipmentPlanId: currentPlan?.id || null,
          },
        })

        // Update shipment plan status and clear link
        await prisma.shipmentPlan.update({
          where: { id: planId },
          data: {
            data: {
              ...shipmentPlanData,
              booking_status: "Awaiting Booking",
            },
            linkedStatus: 0,
          },
        })

        return redirect("/shipment-plans")
      }
    }

    if (rejectUnmapping) {
      // Handle unmapping rejection - keep records linked but clear unmapping request
      const currentPlan = await prisma.shipmentPlan.findUnique({
        where: { id: planId },
        include: { linerBooking: true },
      })

      if (currentPlan?.linerBooking) {
        // Update liner booking to clear unmapping request and revert to Booked status
        const linerBookingData = currentPlan.linerBooking.data as any
        await prisma.linerBooking.update({
          where: { id: currentPlan.linerBooking.id },
          data: {
            data: {
              ...linerBookingData,
              carrier_booking_status: "Booked",
              unmapping_request: false,
              unmapping_reason: "",
            },
            linkedStatus: 1,
          },
        })

        return redirect("/shipment-plans")
      }
    } // Get form values
    const bussiness_branch = formData.get("bussiness_branch") as string
    const shipment_type = formData.get("shipment_type") as string
    const booking_status = formData.get("booking_status") as string
    const loading_port = formData.get("loading_port") as string
    const destination_country = formData.get("destination_country") as string
    const customer = formData.get("customer") as string

    // Parse package details from form data
    const packageDetails: any[] = []
    let packageIndex = 0
    while (formData.get(`package_details[${packageIndex}][shipper]`) !== null) {
      packageDetails.push({
        shipper: formData.get(`package_details[${packageIndex}][shipper]`) as string,
        invoice_number: formData.get(`package_details[${packageIndex}][invoice_number]`) as string,
        volume: Number.parseFloat(formData.get(`package_details[${packageIndex}][volume]`) as string) || 0,
        gross_weight: Number.parseFloat(formData.get(`package_details[${packageIndex}][gross_weight]`) as string) || 0,
        number_of_packages:
          Number.parseInt(formData.get(`package_details[${packageIndex}][number_of_packages]`) as string) || 0,
        projected_cargo_ready_date: formData.get(
          `package_details[${packageIndex}][projected_cargo_ready_date]`,
        ) as string,
        commodity: formData.get(`package_details[${packageIndex}][commodity]`) as string,
        is_haz: formData.get(`package_details[${packageIndex}][is_haz]`) === "true",
        p_o_number: formData.get(`package_details[${packageIndex}][p_o_number]`) as string,
        C_H_A: formData.get(`package_details[${packageIndex}][C_H_A]`) === "true",
      })
      packageIndex++
    }

    // Parse equipment details from form data with new structure and TEMP replacement
    const equipmentDetails: any[] = []
    let equipmentIndex = 0
    const existingPlanData = existingPlan.data as any
    const reference_number = existingPlanData.reference_number

    while (formData.get(`equipment_details[${equipmentIndex}][equipment_type]`) !== null) {
      const equipmentType = formData.get(`equipment_details[${equipmentIndex}][equipment_type]`) as string
      const trackingNumber = formData.get(`equipment_details[${equipmentIndex}][trackingNumber]`) as string
      const equipmentSequence =
        Number.parseInt(formData.get(`equipment_details[${equipmentIndex}][equipmentSequence]`) as string) ||
        equipmentIndex + 1

      // Generate proper tracking number with actual reference number (replace TEMP if needed)
      const equipmentCode = generateEquipmentCode(equipmentType)
      const finalTrackingNumber =
        trackingNumber && trackingNumber.startsWith("TEMP-")
          ? trackingNumber.replace("TEMP", reference_number)
          : trackingNumber || `${reference_number}-${equipmentCode}-${String(equipmentSequence).padStart(3, "0")}`

      equipmentDetails.push({
        equipment_type: equipmentType,
        trackingNumber: finalTrackingNumber,
        equipmentSequence: equipmentSequence,
        number_of_equipment: 1, // Always 1 in new structure
        stuffing_point: formData.get(`equipment_details[${equipmentIndex}][stuffing_point]`) as string,
        empty_container_pick_up_from: formData.get(
          `equipment_details[${equipmentIndex}][empty_container_pick_up_from]`,
        ) as string,
        container_handover_location: formData.get(
          `equipment_details[${equipmentIndex}][container_handover_location]`,
        ) as string,
        empty_container_pick_up_location: formData.get(
          `equipment_details[${equipmentIndex}][empty_container_pick_up_location]`,
        ) as string,
        container_handover_at: formData.get(`equipment_details[${equipmentIndex}][container_handover_at]`) as string,
        // Individual status fields
        status: (formData.get(`equipment_details[${equipmentIndex}][status]`) as string) || "Pending",
        emptyPickupStatus: formData.get(`equipment_details[${equipmentIndex}][emptyPickupStatus]`) === "true",
        stuffingStatus: formData.get(`equipment_details[${equipmentIndex}][stuffingStatus]`) === "true",
        gateInStatus: formData.get(`equipment_details[${equipmentIndex}][gateInStatus]`) === "true",
        loadedStatus: formData.get(`equipment_details[${equipmentIndex}][loadedStatus]`) === "true",
        emptyPickupDate: (formData.get(`equipment_details[${equipmentIndex}][emptyPickupDate]`) as string) || "",
        stuffingDate: (formData.get(`equipment_details[${equipmentIndex}][stuffingDate]`) as string) || "",
        gateInDate: (formData.get(`equipment_details[${equipmentIndex}][gateInDate]`) as string) || "",
        loadedDate: (formData.get(`equipment_details[${equipmentIndex}][loadedDate]`) as string) || "",
      })
      equipmentIndex++
    }

    // Get container tracking fields
    const container_stuffing_completed_date = formData.get("container_stuffing_completed_date") as string
    const empty_container_picked_up_date = formData.get("empty_container_picked_up_date") as string
    const gated_in_date = formData.get("gated_in_date") as string
    const loaded_on_board_date = formData.get("loaded_on_board_date") as string
    const md_approval_status = formData.get("md_approval") as string
    const md_approval_rejection = (formData.get("md_approval_rejection") as string) || ""

    let bookingStatus
    let shouldCreateShipmentAssignment = false
    let linerBrokerId = null

    //If already booked
    if (existingPlan?.data?.booking_status === "Booked") {
      bookingStatus = "Booked"
    } else {
      //update booking status
      if (md_approval_status === "approved" && md_approval_rejection === "") {
        bookingStatus = "Awaiting Booking"
        shouldCreateShipmentAssignment = true
        linerBrokerId = formData.get("liner_broker_approval") as string

        // Check if the plan is in "Awaiting MD Approval" status
        const planData = existingPlan.data as any
        if (planData.booking_status !== "Awaiting MD Approval") {
          return {
            error: "Only plans with 'Awaiting MD Approval' status can be approved",
          }
        }
      } else if (md_approval_status === "rejected" && md_approval_rejection === "") {
        bookingStatus = "MD Approval Rejected"
      } else if (md_approval_rejection != "") {
        bookingStatus = "Awaiting MD Approval"
      } else {
        bookingStatus = booking_status
      }
    }

    const shipmentData = {
      reference_number: (existingPlan.data as any).reference_number, // Keep existing reference number
      bussiness_branch,
      shipment_type,
      booking_status: bookingStatus,
      package_details: packageDetails,
      equipment_details: equipmentDetails,
      md_approval_status: md_approval_status || null,
      liner_broker_approval: linerBrokerId || null,
      rejection_comment: (formData.get("rejection_comment") as string) || null,
      remarks: (formData.get("remarks") as string) || null,
      container_movement: {
        loading_port,
        destination_country,
        delivery_till: formData.get("delivery_till") as string,
        port_of_discharge: formData.get("port_of_discharge") as string,
        final_place_of_delivery: formData.get("final_place_of_delivery") as string,
        required_free_time_at_destination: formData.get("required_free_time_at_destination") as string,
        carrier_and_vessel_preference: {
          carrier: formData.get("carrier") as string,
          vessel: formData.get("vessel") as string,
          preferred_etd: formData.get("preferred_etd") as string,
        },
        customer,
        consignee: formData.get("consignee") as string,
        selling_price: formData.get("selling_price") as string,
        rebate: formData.get("rebate") as string,
        credit_period: Number.parseInt(formData.get("credit_period") as string) || 0,
        buying_price: Number.parseFloat(formData.get("buying_price") as string) || 0,
        specific_stuffing_requirement: formData.get("specific_stuffing_requirement") === "true",
        stuffing_instructions: formData.get("stuffing_instructions") as string,
        specific_instructions: formData.get("specific_instructions") as string,
        liner_booking_details: formData.get("liner_booking_details") as string,
      },
      container_tracking: {
        container_current_status: (formData.get("container_current_status") as string) || "Pending",
        container_stuffing_completed: formData.get("container_stuffing_completed") === "true",
        container_stuffing_completed_date: container_stuffing_completed_date
          ? new Date(container_stuffing_completed_date).toISOString()
          : null,
        empty_container_picked_up_status: formData.get("empty_container_picked_up_status") === "true",
        empty_container_picked_up_date: empty_container_picked_up_date
          ? new Date(empty_container_picked_up_date).toISOString()
          : null,
        gated_in_status: formData.get("gated_in_status") === "true",
        gated_in_date: gated_in_date ? new Date(gated_in_date).toISOString() : null,
        loaded_on_board_status: formData.get("loaded_on_board_status") === "true",
        loaded_on_board_date: loaded_on_board_date ? new Date(loaded_on_board_date).toISOString() : null,
      },
    }

    try {
      if (shouldCreateShipmentAssignment) {
        await prisma.$transaction(async (tx) => {
          // Create a new shipment assignment
          const assignmentData = {
            carrier_booking_status: "Awaiting Booking",
          }

          const assignment = await tx.shipmentAssignment.create({
            data: {
              data: assignmentData,
              userId: user.id,
              assignBookingId: (linerBrokerId as string) || null,
            },
          })

          await tx.shipmentPlan.update({
            where: { id: planId },
            data: {
              data: shipmentData,
              shipmentAssignmentId: assignment.id,
              linkedStatus: 1, // Set linked status
            },
          })
        })
      } else {
        await prisma.shipmentPlan.update({
          where: { id: planId },
          data: {
            data: shipmentData,
          },
        })
      }

      console.log("Shipment plan updated successfully")
    } catch (error) {
      console.error("Failed to update shipment plan:", error)
      return {
        error: "Failed to update shipment plan. Please try again.",
      }
    }

    return redirect("/shipment-plans")
  } catch (error) {
    console.error("Edit shipment plan action error:", error)
    return { error: "An error occurred while processing your request" }
  }
}

export default function EditShipmentPlan() {
  const { user, shipmentPlan, dataPoints } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()

  const planData = shipmentPlan.data as any
  const isSubmitting = navigation.state === "submitting"

  return (
    <AdminLayout user={user}>
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-sm">✏️</span>
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Edit Shipment Plan</h1>
                <p className="text-sm text-gray-600 mt-1">Modify shipment plan details - {planData.reference_number}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Link
                to={`/shipment-plans/${shipmentPlan.id}`}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-all duration-200"
              >
                👁️ View Details
              </Link>
              <Link
                to="/shipment-plans"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all duration-200"
              >
                <span className="mr-1">←</span>
                Back to List
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {actionData?.error && (
          <div className="mb-8 bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700 font-medium">Error updating shipment plan</p>
                <p className="text-sm text-red-600 mt-1">{actionData.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {actionData?.success && (
          <div className="mb-8 bg-green-50 border-l-4 border-green-400 p-4 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-green-400 text-xl">✅</span>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700 font-medium">Shipment plan updated successfully</p>
                <p className="text-sm text-green-600 mt-1">{actionData.success}</p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          <ShipmentPlanForm
            mode="edit"
            dataPoints={dataPoints}
            actionData={actionData}
            isSubmitting={isSubmitting}
            planData={planData}
            shipmentPlan={shipmentPlan}
            user={user}
          />
        </div>
      </div>
    </AdminLayout>
  )
}
