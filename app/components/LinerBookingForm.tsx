"use client"

import type React from "react"

import { Form, Link, useNavigation } from "react-router"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Checkbox } from "~/components/ui/checkbox"
import { Select } from "~/components/ui/select"
import { SearchableSelect } from "~/components/ui/searchable-select"
import { Textarea } from "~/components/ui/textarea"
import { useToast } from "~/components/ui/toast"
import { useState, useEffect } from "react"

export interface LinerBookingFormProps {
  mode: "new" | "edit"
  linerBooking?: any
  availableShipmentPlans?: any[]
  dataPoints: {
    carriers: any[]
    vessels: any[]
    organizations: any[]
  }
  actionData?: any
  user?: any
}

export function LinerBookingForm({
  mode,
  linerBooking,
  availableShipmentPlans = [],
  dataPoints,
  actionData,
  user,
}: LinerBookingFormProps) {
  const navigation = useNavigation()
  console.log("[v0] LinerBookingForm props", {
    mode,
    linerBookingId: linerBooking?.id,
    hasShipmentPlan: !!linerBooking?.shipmentPlan,
    shipmentPlanKeys: linerBooking?.shipmentPlan ? Object.keys(linerBooking.shipmentPlan) : [],
    hasDetailsArray: Array.isArray(linerBooking?.data?.liner_booking_details),
  })
  const { addToast } = useToast()

  // Extract data from the JSON field for edit mode
  const data = mode === "edit" ? (linerBooking?.data as any) : null

  // Initialize state for liner booking details
  const [linerBookingDetails, setLinerBookingDetails] = useState(
    mode === "edit" && data?.liner_booking_details
      ? data.liner_booking_details
      : [
          {
            temporary_booking_number: "",
            suffix_for_anticipatory_temporary_booking_number: "",
            liner_booking_number: "",
            mbl_number: "",
            carrier: "",
            contract: "",
            original_planned_vessel: "",
            e_t_d_of_original_planned_vessel: "",
            change_in_original_vessel: false,
            revised_vessel: "",
            etd_of_revised_vessel: "",
            empty_pickup_validity_from: "",
            empty_pickup_validity_till: "",
            estimate_gate_opening_date: "",
            estimated_gate_cutoff_date: "",
            s_i_cut_off_date: "",
            booking_received_from_carrier_on: "",
            additional_remarks: "",
            line_booking_copy: "",
            equipment_type: "",
          },
        ],
  )

  const [openSections, setOpenSections] = useState(() => {
    if (mode === "edit") {
      return {
        linkedPlan: true,
        linkToPlan: false,
        general: true,
        details: true, // Keep details open in edit mode
      }
    } else {
      return {
        linkToPlan: false,
        general: true,
        details: true, // Keep details open in new mode as well
      }
    }
  })

  const [currentStatus, setCurrentStatus] = useState(
    mode === "edit" ? data?.carrier_booking_status || "Awaiting MD Approval" : "Awaiting MD Approval",
  )

  const [unmappingRequested, setUnmappingRequested] = useState(
    mode === "edit" ? data?.unmapping_request || false : false,
  )

  // Equipment validation for booking details
  const [equipmentValidation, setEquipmentValidation] = useState({
    isValid: false,
    message: "",
    remainingEquipment: {} as Record<string, number>,
  })

  const isSubmitting = navigation.state === "submitting"

  // Get equipment details from linked shipment plan
  const getShipmentPlanEquipment = () => {
    if (mode === "edit" && linerBooking?.shipmentPlan) {
      const planData = linerBooking.shipmentPlan.data as any
      return planData?.equipment_details || []
    }
    return []
  }

  // Add this function after the getShipmentPlanEquipment function (around line 85)
  const getAvailableEquipmentForBookingDetail = (currentIndex: number) => {
    const allEquipment = getShipmentPlanEquipment()
    const selectedEquipment = linerBookingDetails
      .map((detail: any, index: number) => {
        // Don't filter out the current booking detail's selection
        if (index === currentIndex) return null
        return detail.equipment_type ? detail.equipment_type.split("|")[1] : null // Get tracking number
      })
      .filter(Boolean)

    return allEquipment.filter((equipment: any) => !selectedEquipment.includes(equipment.trackingNumber))
  }

  // Calculate total equipment required from shipment plan
  const calculateRequiredEquipment = () => {
    const equipment = getShipmentPlanEquipment()
    const required = {} as Record<string, number>

    equipment.forEach((item: any) => {
      if (item.equipment_type && item.number_of_equipment) {
        const key = item.equipment_type
        required[key] = (required[key] || 0) + Number.parseInt(item.number_of_equipment)
      }
    })

    return required
  }

  const calculateAllocatedEquipment = () => {
    const allocated = {} as Record<string, number>

    linerBookingDetails.forEach((detail: any) => {
      if (detail.equipment_type) {
        const [equipmentType] = detail.equipment_type.split("|")
        allocated[equipmentType] = (allocated[equipmentType] || 0) + 1
      }
    })

    return allocated
  }

  // Validate equipment allocation
  const validateEquipmentAllocation = () => {
    if (mode !== "edit" || !linerBooking?.shipmentPlan) {
      setEquipmentValidation({
        isValid: true,
        message: "",
        remainingEquipment: {},
      })
      return
    }

    const required = calculateRequiredEquipment()
    const allocated = calculateAllocatedEquipment()
    const remaining = {} as Record<string, number>
    let isValid = true
    let message = ""

    // Check if we have any equipment requirements
    if (Object.keys(required).length === 0) {
      setEquipmentValidation({
        isValid: true,
        message: "",
        remainingEquipment: {},
      })
      return
    }

    // Calculate remaining equipment and check validation
    for (const [equipmentType, requiredQty] of Object.entries(required)) {
      const allocatedQty = allocated[equipmentType] || 0
      remaining[equipmentType] = requiredQty - allocatedQty

      if (remaining[equipmentType] > 0) {
        isValid = false
      }
      if (remaining[equipmentType] < 0) {
        isValid = false
        message = `Over-allocated ${equipmentType}: ${Math.abs(remaining[equipmentType])} units excess`
      }
    }

    if (!isValid && !message) {
      const remainingItems = Object.entries(remaining)
        .filter(([_, qty]) => qty > 0)
        .map(([type, qty]) => `${type}: ${qty} units`)
        .join(", ")
      message = `Remaining equipment to allocate: ${remainingItems}`
    }

    if (isValid) {
      message = "All equipment properly allocated ✓"
    }

    setEquipmentValidation({ isValid, message, remainingEquipment: remaining })
  }

  // Update state when data changes (after successful form submission)
  useEffect(() => {
    if (mode === "edit" && data) {
      setCurrentStatus(data?.carrier_booking_status || "Awaiting MD Approval")
      setUnmappingRequested(data?.unmapping_request || false)
    }
  }, [mode, data])

  // Run validation when booking details change
  useEffect(() => {
    validateEquipmentAllocation()
  }, [linerBookingDetails, mode, linerBooking?.shipmentPlan])

  // Keep details section open after form submissions
  useEffect(() => {
    if (actionData && !actionData.error) {
      // If form was submitted successfully, keep details section open
      setOpenSections((prev) => ({ ...prev, details: true, general: true }))
    }
  }, [actionData])

  // Handle navigation state changes to maintain form sections
  useEffect(() => {
    if (navigation.state === "loading" && navigation.formData) {
      // If "All Booking Assigned" was clicked, keep sections open
      const allBookingAssigned = navigation.formData.get("all_booking_assigned")
      if (allBookingAssigned) {
        setOpenSections((prev) => ({
          ...prev,
          details: true,
          general: true,
          linkedPlan: mode === "edit" && linerBooking?.shipmentPlan ? true : prev.linkedPlan,
        }))
      }
    }
  }, [navigation.state, navigation.formData, mode, linerBooking?.shipmentPlan])

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Safely display data utility
  const renderData = (data: any, fallback = "N/A") => {
    if (data === null || data === undefined || data === "") return fallback
    if (typeof data === "string") return data
    if (typeof data === "number") return data.toString()
    if (typeof data === "boolean") return data ? "Yes" : "No"
    if (Array.isArray(data)) return data.length > 0 ? data : fallback
    if (typeof data === "object") return JSON.stringify(data, null, 2)
    return fallback
  }

  const renderArray = (array: any[], title: string) => {
    if (!Array.isArray(array) || array.length === 0) return null

    return (
      <div className="mt-6">
        <h4 className="text-md font-semibold text-gray-800 mb-4">{title}</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                {Object.keys(array[0] || {}).map((key) => (
                  <th
                    key={key}
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b"
                  >
                    {key.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {array.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {Object.entries(item).map(([key, value]) => (
                    <td key={key} className="px-4 py-2 text-sm text-gray-900 border-b">
                      {renderData(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const addLinerBookingDetail = () => {
    setLinerBookingDetails([
      ...linerBookingDetails,
      {
        temporary_booking_number: "",
        suffix_for_anticipatory_temporary_booking_number: "",
        liner_booking_number: "",
        mbl_number: "",
        carrier: "",
        contract: "",
        original_planned_vessel: "",
        e_t_d_of_original_planned_vessel: "",
        change_in_original_vessel: false,
        revised_vessel: "",
        etd_of_revised_vessel: "",
        empty_pickup_validity_from: "",
        empty_pickup_validity_till: "",
        estimate_gate_opening_date: "",
        estimated_gate_cutoff_date: "",
        s_i_cut_off_date: "",
        booking_received_from_carrier_on: "",
        additional_remarks: "",
        line_booking_copy: "",
        equipment_type: "",
      },
    ])
  }
  const removeLinerBookingDetail = (index: number) => {
    if (linerBookingDetails.length > 1) {
      setLinerBookingDetails(linerBookingDetails.filter((_: any, i: number) => i !== index))
    }
  }

  const updateLinerBookingDetail = (index: number, field: string, value: any) => {
    const updated = [...linerBookingDetails]
    updated[index] = { ...updated[index], [field]: value }
    setLinerBookingDetails(updated)
  }

  const handleUnmappingChange = (checked: boolean) => {
    setUnmappingRequested(checked)
    // Don't automatically change status - user will use the "Request Unmapping" button
  }

  const formatDateForInput = (dateValue: string | null | undefined) => {
    if (!dateValue) return ""
    try {
      const date = new Date(dateValue)
      return date.toISOString().split("T")[0]
    } catch {
      return ""
    }
  }

  // Handle form submission with validation
  const handleFormSubmit = (e: React.FormEvent) => {
    const formData = new FormData(e.target as HTMLFormElement)
    const allBookingAssigned = formData.get("all_booking_assigned")

    // If trying to mark as "All Booking Assigned" but validation fails
    if (allBookingAssigned && !equipmentValidation.isValid) {
      e.preventDefault()
      addToast({
        type: "error",
        title: "Equipment Allocation Error",
        description:
          equipmentValidation.message ||
          'Please allocate all required equipment before marking as "All Booking Assigned"',
        duration: 6000,
      })
      return
    }

    // If validation passes, show success toast and keep sections open
    if (allBookingAssigned && equipmentValidation.isValid) {
      // Keep sections open for "All Booking Assigned"
      setOpenSections((prev) => ({
        ...prev,
        details: true,
        general: true,
        linkedPlan: mode === "edit" && linerBooking?.shipmentPlan ? true : prev.linkedPlan,
      }))

      addToast({
        type: "success",
        title: "Booking Status Updated",
        description:
          'All booking has been assigned successfully. Both liner booking and shipment plan are now marked as "Booked".',
        duration: 5000,
      })
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-sm">🚢</span>
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {mode === "edit" ? "Edit Liner Booking" : "New Liner Booking"}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  {mode === "edit"
                    ? "Update liner booking record with carrier details"
                    : "Create a new liner booking record"}
                </p>
              </div>
            </div>
            <Link
              to="/liner-bookings"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all duration-200"
            >
              <span className="mr-1">←</span>
              Back to List
            </Link>
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
                <p className="text-sm text-red-700 font-medium">
                  Error {mode === "edit" ? "updating" : "creating"} liner booking
                </p>
                <p className="text-sm text-red-600 mt-1">{actionData.error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          <Form method="post" className="space-y-8" onSubmit={handleFormSubmit} encType="multipart/form-data">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Liner Booking Details</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {mode === "edit"
                        ? "Update the details for your liner booking"
                        : "Enter the details for your new liner booking"}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {mode === "edit" ? "Editing" : "Creating"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {/* Linked Shipment Plan Information - Only in Edit Mode */}
                {mode === "edit" && linerBooking?.shipmentPlan && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleSection("linkedPlan")}
                      className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                            openSections.linkedPlan ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <span className="text-sm">🔗</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">Linked Shipment Plan</h3>
                          <p className="text-sm text-gray-500">Details from the connected shipment plan (read-only)</p>
                        </div>
                      </div>
                      <div
                        className={`transform transition-transform duration-200 ${
                          openSections.linkedPlan ? "rotate-180" : ""
                        }`}
                      >
                        <span className="text-gray-400">↓</span>
                      </div>
                    </button>

                    {openSections.linkedPlan && (
                      <div className="px-6 pb-6 bg-green-50/30">
                        <div className="pt-4">
                          {/* Basic Information Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Reference Number</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.reference_number)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Business Branch</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.bussiness_branch)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Shipment Type</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.shipment_type)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Booking Status</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.booking_status)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Customer</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.container_movement?.customer)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Created By</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData(linerBooking.shipmentPlan?.user?.name)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Loading Port</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.container_movement?.loading_port)}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Port of Discharge</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData(
                                  (linerBooking.shipmentPlan?.data as any)?.container_movement?.port_of_discharge,
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Destination Country</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData(
                                  (linerBooking.shipmentPlan?.data as any)?.container_movement?.destination_country,
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Final Place of Delivery</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData(
                                  (linerBooking.shipmentPlan?.data as any)?.container_movement?.final_place_of_delivery,
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Delivery Till</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData(
                                  (linerBooking.shipmentPlan?.data as any)?.container_movement?.delivery_till,
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-semibold text-gray-700">Created Date</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {linerBooking.shipmentPlan?.createdAt
                                  ? new Date(linerBooking.shipmentPlan.createdAt).toLocaleDateString()
                                  : "N/A"}
                              </div>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label className="text-sm font-semibold text-gray-700">Shipment Plan Remarks</Label>
                              <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700">
                                {renderData((linerBooking.shipmentPlan?.data as any)?.remarks)}
                              </div>
                            </div>
                          </div>

                          {/* Array Data as Tables */}
                          {renderArray((linerBooking.shipmentPlan?.data as any)?.package_details, "Package Details")}
                          {renderArray(
                            (linerBooking.shipmentPlan?.data as any)?.equipment_details,
                            "Equipment Details",
                          )}

                          {renderArray(
                            [(linerBooking.shipmentPlan?.data as any)?.container_movement],
                            "Container Movement Details",
                          )}
                          {renderArray(
                            [
                              (linerBooking.shipmentPlan?.data as any)?.container_movement
                                ?.carrier_and_vessel_preference,
                            ],
                            "Carrier and Vessel Preferences",
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Shipment Plan Linking Section - For Edit Mode without linked plan or New Mode */}
                {((mode === "edit" && (!linerBooking?.shipmentPlan || currentStatus === "Ready for Re-linking")) ||
                  mode === "new") && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleSection("linkToPlan")}
                      className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                            openSections.linkToPlan ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <span className="text-sm">🔗</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">Link to Shipment Plan</h3>
                          <p className="text-sm text-gray-500">
                            {mode === "new"
                              ? "Connect this liner booking to a shipment plan"
                              : "Re-link this liner booking to a different shipment plan"}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`transform transition-transform duration-200 ${
                          openSections.linkToPlan ? "rotate-180" : ""
                        }`}
                      >
                        <span className="text-gray-400">↓</span>
                      </div>
                    </button>

                    {openSections.linkToPlan && (
                      <div className="px-6 pb-6 bg-blue-50/30">
                        <div className="pt-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="link_to_shipment_plan" className="text-sm font-semibold text-gray-700">
                                Select Shipment Plan
                              </Label>
                              <Select
                                id="link_to_shipment_plan"
                                name="link_to_shipment_plan"
                                className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">-- Select a shipment plan --</option>
                                {availableShipmentPlans.map((plan) => (
                                  <option key={plan.id} value={plan.id}>
                                    {(plan.data as any)?.reference_number || plan.id} -
                                    {(plan.data as any)?.container_movement?.customer || "No Customer"} -
                                    {new Date(plan.createdAt).toLocaleDateString()}
                                  </option>
                                ))}
                              </Select>
                            </div>

                            <div className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-200">
                              <strong>Note:</strong> Linking will connect this liner booking to the selected shipment
                              plan. Both records will be updated to reflect this relationship.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* General Information Section */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleSection("general")}
                    className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          openSections.general ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span className="text-sm">📋</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">General Information</h3>
                        <p className="text-sm text-gray-500">Basic liner booking settings and status</p>
                      </div>
                    </div>
                    <div
                      className={`transform transition-transform duration-200 ${
                        openSections.general ? "rotate-180" : ""
                      }`}
                    >
                      <span className="text-gray-400">↓</span>
                    </div>
                  </button>

                  {openSections.general && (
                    <div className="px-6 pb-6 bg-blue-50/30">
                      <div className="pt-4 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="carrier_booking_status" className="text-sm font-semibold text-gray-700">
                              Carrier Booking Status
                            </Label>
                            <Select
                              id="carrier_booking_status"
                              name="carrier_booking_status"
                              value={currentStatus}
                              disabled={true}
                              onChange={(e) => setCurrentStatus(e.target.value)}
                              className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="Awaiting MD Approval">Awaiting MD Approval</option>
                              <option value="Approved by MD for Booking">Approved by MD for Booking</option>
                              <option value="Booked">Booked</option>
                              <option value="Ready for Re-linking">Ready for Re-linking</option>
                              <option value="Unmapping Requested">Unmapping Requested</option>
                              <option value="Unmapping Approval">Unmapping Approval</option>
                            </Select>
                            {/* Hidden input to ensure current status is not overridden */}
                            <input type="hidden" name="current_status" value={currentStatus} />
                          </div>

                          {/* <div className="space-y-2">
                            <Label htmlFor="booking_released_to" className="text-sm font-semibold text-gray-700">
                              Booking Released To
                            </Label>
                            <SearchableSelect
                              name="booking_released_to"
                              placeholder="Search organizations..."
                              className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              options={dataPoints.organizations.map(org => ({
                                value: org.name,
                                label: org.name
                              }))}
                              value={mode === 'edit' ? (data?.booking_released_to || '') : ''}
                            />
                          </div> */}
                        </div>

                        {/* Unmapping Section - Show for different states */}
                        {mode === "edit" &&
                          (currentStatus === "Booked" ||
                            currentStatus === "Unmapping Requested" ||
                            currentStatus === "Unmapping Approval") && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                              <div className="flex items-start space-x-3">
                                <Checkbox
                                  id="unmapping_request"
                                  name="unmapping_request"
                                  checked={unmappingRequested}
                                  onChange={(e) => handleUnmappingChange(e.target.checked)}
                                  className="mt-1"
                                  disabled={
                                    currentStatus === "Unmapping Requested" || currentStatus === "Unmapping Approval"
                                  }
                                  value="true"
                                />
                                <div className="flex-1">
                                  <Label htmlFor="unmapping_request" className="text-sm font-semibold text-gray-700">
                                    {currentStatus === "Booked"
                                      ? "Request Unmapping"
                                      : currentStatus === "Unmapping Requested"
                                        ? "Unmapping Requested"
                                        : "Unmapping Under Review"}
                                  </Label>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {currentStatus === "Booked"
                                      ? "Check this to request unmapping from the linked shipment plan"
                                      : currentStatus === "Unmapping Requested"
                                        ? "Your unmapping request is pending approval"
                                        : "The unmapping request is being reviewed by administrators"}
                                  </p>
                                </div>
                              </div>

                              {(unmappingRequested ||
                                currentStatus === "Unmapping Requested" ||
                                currentStatus === "Unmapping Approval") && (
                                <div className="mt-4 space-y-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="unmapping_reason" className="text-sm font-semibold text-gray-700">
                                      Unmapping Reason <span className="text-red-500">*</span>
                                    </Label>
                                    <Textarea
                                      id="unmapping_reason"
                                      name="unmapping_reason"
                                      defaultValue={mode === "edit" ? data?.unmapping_reason || "" : ""}
                                      placeholder="Please provide a reason for unmapping..."
                                      rows={3}
                                      className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      required={unmappingRequested || currentStatus === "Unmapping Requested"}
                                      disabled={currentStatus === "Unmapping Approval"}
                                    />
                                  </div>

                                  {/* Request Unmapping Button - Only show when checkbox is checked and status is still Booked */}
                                  {unmappingRequested && currentStatus === "Booked" && (
                                    <div className="flex justify-end">
                                      <Button
                                        type="submit"
                                        name="request_unmapping"
                                        value="true"
                                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                                      >
                                        Request Unmapping
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Status Information for Pending Approval */}
                              {currentStatus === "Unmapping Requested" && (
                                <div className="mt-4 bg-yellow-50 p-3 rounded-lg border border-yellow-300">
                                  <h5 className="text-sm font-semibold text-yellow-800 mb-1">Pending Approval</h5>
                                  <p className="text-sm text-yellow-700">
                                    Your unmapping request is pending approval. Please check the linked Shipment Plan
                                    for admin approval actions.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                        {/* Re-linking Section for Ready for Re-linking status */}
                        {mode === "edit" && currentStatus === "Ready for Re-linking" && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Ready for Re-linking</h4>
                            <p className="text-sm text-gray-600 mb-4">
                              This liner booking has been unmapped and is ready to be linked to a new shipment plan. Use
                              the "Link to Shipment Plan" section below to connect it to a new plan.
                            </p>
                            <div className="flex items-center text-sm text-blue-700">
                              <span className="mr-2">💡</span>
                              Select a shipment plan from the linking section to complete the re-linking process.
                            </div>
                          </div>
                        )}

                        {/* Equipment Validation Display - Only for Edit Mode with Shipment Plan */}
                        {mode === "edit" && linerBooking?.shipmentPlan && getShipmentPlanEquipment().length > 0 && (
                          <div
                            className={`border rounded-lg p-4 ${
                              equipmentValidation.isValid
                                ? "bg-green-50 border-green-200"
                                : "bg-yellow-50 border-yellow-200"
                            }`}
                          >
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Equipment Allocation Status</h4>
                            <p
                              className={`text-sm ${
                                equipmentValidation.isValid ? "text-green-700" : "text-yellow-700"
                              }`}
                            >
                              {equipmentValidation.message}
                            </p>

                            {/* Equipment Summary */}
                            <div className="mt-3 grid grid-cols-2 gap-4">
                              <div>
                                <h5 className="text-xs font-medium text-gray-600 mb-1">Required Equipment:</h5>
                                {Object.entries(calculateRequiredEquipment()).map(([type, qty]) => (
                                  <div key={type} className="text-xs text-gray-700">
                                    {type}: {qty} units
                                  </div>
                                ))}
                              </div>
                              <div>
                                <h5 className="text-xs font-medium text-gray-600 mb-1">Allocated Equipment:</h5>
                                {Object.entries(calculateAllocatedEquipment()).map(([type, qty]) => (
                                  <div key={type} className="text-xs text-gray-700">
                                    {type}: {qty} units
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* All Booking Assigned Button - Only for Edit Mode */}
                        {mode === "edit" && currentStatus !== "Booked" && linerBooking?.shipmentPlan && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700">All Booking Assigned</h4>
                                <p className="text-sm text-gray-600 mt-1">
                                  {equipmentValidation.isValid
                                    ? 'Click to mark both liner booking and linked shipment plan as "Booked"'
                                    : "Complete equipment allocation to enable this option"}
                                </p>
                              </div>
                              <Button
                                type="submit"
                                name="all_booking_assigned"
                                value="true"
                                disabled={!equipmentValidation.isValid}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                  equipmentValidation.isValid
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                }`}
                              >
                                All Booking Assigned
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Liner Booking Details Section */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleSection("details")}
                    className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          openSections.details ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span className="text-sm">📦</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          Liner Booking Details ({linerBookingDetails.length})
                        </h3>
                        <p className="text-sm text-gray-500">Detailed booking information and vessel schedules</p>
                      </div>
                    </div>
                    <div
                      className={`transform transition-transform duration-200 ${
                        openSections.details ? "rotate-180" : ""
                      }`}
                    >
                      <span className="text-gray-400">↓</span>
                    </div>
                  </button>

                  {openSections.details && (
                    <div className="px-6 pb-6 bg-purple-50/30">
                      <div className="pt-4">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-md font-semibold text-gray-800">Booking Details</h4>
                          <Button
                            type="button"
                            onClick={addLinerBookingDetail}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200"
                          >
                            + Add Detail
                          </Button>
                        </div>

                        {linerBookingDetails.map((detail: any, index: number) => (
                          <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 mb-4 relative">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="text-sm font-semibold text-gray-700">Booking Detail #{index + 1}</h5>
                              {linerBookingDetails.length > 1 && (
                                <Button
                                  type="button"
                                  onClick={() => removeLinerBookingDetail(index)}
                                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-medium transition-all duration-200"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {/* Equipment Selection - Only show if linked to shipment plan */}
                              {mode === "edit" &&
                                linerBooking?.shipmentPlan &&
                                getShipmentPlanEquipment().length > 0 && (
                                  <>
                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium text-gray-600">
                                        Equipment Type <span className="text-red-500">*</span>
                                      </Label>
                                      <Select
                                        name={`liner_booking_details[${index}][equipment_type]`}
                                        value={detail.equipment_type || ""}
                                        onChange={(e) =>
                                          updateLinerBookingDetail(index, "equipment_type", e.target.value)
                                        }
                                        className="text-sm"
                                      >
                                        <option value="">-- Select Equipment --</option>
                                        {getAvailableEquipmentForBookingDetail(index).map(
                                          (equipment: any, eqIndex: number) => (
                                            <option
                                              key={eqIndex}
                                              value={`${equipment.equipment_type}|${equipment.trackingNumber}`}
                                            >
                                              {equipment.equipment_type} ({equipment.trackingNumber})
                                            </option>
                                          ),
                                        )}
                                      </Select>
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="text-xs font-medium text-gray-600">Booking For</Label>
                                      <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
                                        {detail.equipment_type
                                          ? (() => {
                                              const [equipmentType, trackingNumber] = detail.equipment_type.split("|")
                                              return `${equipmentType} - ${trackingNumber}`
                                            })()
                                          : "Select equipment"}
                                      </div>
                                    </div>
                                  </>
                                )}

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Temporary Booking Number</Label>
                                <Input
                                  name={`liner_booking_details[${index}][temporary_booking_number]`}
                                  value={detail.temporary_booking_number}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "temporary_booking_number", e.target.value)
                                  }
                                  placeholder="Enter temp booking number"
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">
                                  Suffix for Anticipatory Temp Booking Number
                                </Label>
                                <Input
                                  name={`liner_booking_details[${index}][suffix_for_anticipatory_temporary_booking_number]`}
                                  value={detail.suffix_for_anticipatory_temporary_booking_number}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(
                                      index,
                                      "suffix_for_anticipatory_temporary_booking_number",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Enter suffix"
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Liner Booking Number</Label>
                                <Input
                                  name={`liner_booking_details[${index}][liner_booking_number]`}
                                  value={detail.liner_booking_number}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "liner_booking_number", e.target.value)
                                  }
                                  placeholder="Enter liner booking number"
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">MBL Number</Label>
                                <Input
                                  name={`liner_booking_details[${index}][mbl_number]`}
                                  value={detail.mbl_number}
                                  onChange={(e) => updateLinerBookingDetail(index, "mbl_number", e.target.value)}
                                  placeholder="Enter MBL number"
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Carrier</Label>
                                <SearchableSelect
                                  name={`liner_booking_details[${index}][carrier]`}
                                  value={detail.carrier}
                                  onChange={(value) => updateLinerBookingDetail(index, "carrier", value)}
                                  placeholder="Search carriers..."
                                  className="text-sm"
                                  options={dataPoints.carriers.map((carrier) => ({
                                    value: carrier.name,
                                    label: carrier.name,
                                  }))}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Contract</Label>
                                <Input
                                  name={`liner_booking_details[${index}][contract]`}
                                  value={detail.contract}
                                  onChange={(e) => updateLinerBookingDetail(index, "contract", e.target.value)}
                                  placeholder="Enter contract"
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Original Planned Vessel</Label>
                                <SearchableSelect
                                  name={`liner_booking_details[${index}][original_planned_vessel]`}
                                  value={detail.original_planned_vessel}
                                  onChange={(value) =>
                                    updateLinerBookingDetail(index, "original_planned_vessel", value)
                                  }
                                  placeholder="Search vessels..."
                                  className="text-sm"
                                  options={dataPoints.vessels.map((vessel) => ({
                                    value: vessel.name,
                                    label: vessel.name,
                                  }))}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">
                                  <Checkbox
                                    name={`liner_booking_details[${index}][change_in_original_vessel]`}
                                    checked={detail.change_in_original_vessel}
                                    onChange={(checked) =>
                                      updateLinerBookingDetail(index, "change_in_original_vessel", checked)
                                    }
                                    className="mr-2"
                                  />
                                  Change in Original Vessel
                                </Label>
                              </div>
                            </div>

                            {detail.change_in_original_vessel && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-gray-600">Revised Vessel</Label>
                                  <SearchableSelect
                                    name={`liner_booking_details[${index}][revised_vessel]`}
                                    value={detail.revised_vessel}
                                    onChange={(value) => updateLinerBookingDetail(index, "revised_vessel", value)}
                                    placeholder="Search vessels..."
                                    className="text-sm"
                                    options={dataPoints.vessels.map((vessel) => ({
                                      value: vessel.name,
                                      label: vessel.name,
                                    }))}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-gray-600">ETD of Revised Vessel</Label>
                                  <Input
                                    type="date"
                                    name={`liner_booking_details[${index}][etd_of_revised_vessel]`}
                                    value={formatDateForInput(detail.etd_of_revised_vessel)}
                                    onChange={(e) =>
                                      updateLinerBookingDetail(index, "etd_of_revised_vessel", e.target.value)
                                    }
                                    className="text-sm"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">
                                  ETD of Original Planned Vessel
                                </Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][e_t_d_of_original_planned_vessel]`}
                                  value={formatDateForInput(detail.e_t_d_of_original_planned_vessel)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "e_t_d_of_original_planned_vessel", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Empty Pickup Validity From</Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][empty_pickup_validity_from]`}
                                  value={formatDateForInput(detail.empty_pickup_validity_from)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "empty_pickup_validity_from", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Empty Pickup Validity Till</Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][empty_pickup_validity_till]`}
                                  value={formatDateForInput(detail.empty_pickup_validity_till)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "empty_pickup_validity_till", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Gate Opening Date</Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][estimate_gate_opening_date]`}
                                  value={formatDateForInput(detail.estimate_gate_opening_date)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "estimate_gate_opening_date", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Gate Cutoff Date</Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][estimated_gate_cutoff_date]`}
                                  value={formatDateForInput(detail.estimated_gate_cutoff_date)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "estimated_gate_cutoff_date", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">SI Cut Off Date</Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][s_i_cut_off_date]`}
                                  value={formatDateForInput(detail.s_i_cut_off_date)}
                                  onChange={(e) => updateLinerBookingDetail(index, "s_i_cut_off_date", e.target.value)}
                                  className="text-sm"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">
                                  Booking Received From Carrier On
                                </Label>
                                <Input
                                  type="date"
                                  name={`liner_booking_details[${index}][booking_received_from_carrier_on]`}
                                  value={formatDateForInput(detail.booking_received_from_carrier_on)}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "booking_received_from_carrier_on", e.target.value)
                                  }
                                  className="text-sm"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">Line Booking Copy (URL)</Label>
                                <Input
                                  type="url"
                                  name={`liner_booking_details[${index}][line_booking_copy]`}
                                  value={detail.line_booking_copy}
                                  onChange={(e) => updateLinerBookingDetail(index, "line_booking_copy", e.target.value)}
                                  placeholder="Enter document URL"
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-600">
                                  Line Booking Copy (PDF File)
                                </Label>
                                <Input
                                  type="file"
                                  name={`liner_booking_details[${index}][line_booking_copy_file]`}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(
                                      index,
                                      "line_booking_copy_file",
                                      e.target.files ? e.target.files[0] : null,
                                    )
                                  }
                                  accept=".pdf"
                                  className="text-sm"
                                />
                                {detail.line_booking_copy_file && typeof detail.line_booking_copy_file === "string" && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Current file:{" "}
                                    <a
                                      href={detail.line_booking_copy_file}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                    >
                                      View PDF
                                    </a>
                                  </p>
                                )}
                              </div>

                              <div className="space-y-2 md:col-span-3">
                                <Label className="text-xs font-medium text-gray-600">Additional Remarks</Label>
                                <Textarea
                                  name={`liner_booking_details[${index}][additional_remarks]`}
                                  value={detail.additional_remarks}
                                  onChange={(e) =>
                                    updateLinerBookingDetail(index, "additional_remarks", e.target.value)
                                  }
                                  placeholder="Enter additional remarks"
                                  className="text-sm"
                                  rows={2}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-end space-x-3">
                  <Link
                    to="/liner-bookings"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                  >
                    Cancel
                  </Link>

                  <div className="flex justify-end space-x-4 border-t border-gray-200">
                    {/* Debug info for troubleshooting */}
                    {/* {process.env.NODE_ENV === "development" && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          Debug: User role = {user?.role?.name || "No role"}, Submit button is now visible to all users
                        </p>
                      </div>
                    )} */}

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      {isSubmitting ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-3 h-6 w-6 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          {mode === "edit" ? "Updating..." : "Creating..."}
                        </>
                      ) : mode === "edit" ? (
                        "Update Liner Booking"
                      ) : (
                        "Create Liner Booking"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Form>
        </div>
      </div>
    </>
  )
}
