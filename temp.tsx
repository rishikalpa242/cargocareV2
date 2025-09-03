{/* Container Status & Tracking - Only visible when booking status is "Booked" */}
              {((mode === "create" && bookingStatus === "Booked") ||
                (mode === "edit" && bookingStatus === "Booked")) && (
                <AccordionItem>
                  <AccordionTrigger
                    isOpen={openSections.tracking}
                    onClick={() => toggleSection("tracking")}
                  >
                    Container Status & Tracking
                  </AccordionTrigger>
                  <AccordionContent isOpen={openSections.tracking}>
                    <div className="bg-gray-50/50 p-6 rounded-lg">
                      <div className="mb-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Container Status & Tracking
                        </h3>
                        <p className="text-sm text-gray-600">
                          Set initial container status and tracking information
                          for this shipment
                        </p>
                      </div>

                      {/* Container Current Status - Full Width */}
                      <div className="mb-8">
                        <div className="space-y-2">
                          <Label
                            htmlFor="container_current_status"
                            className="text-sm font-semibold text-gray-700"
                          >
                            Container Current Status
                          </Label>
                          <div className="relative max-w-md">
                            <Input
                              id="container_current_status"
                              name="container_current_status"
                              value={getContainerCurrentStatus()}
                              readOnly
                              className="border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed focus:ring-0 focus:border-gray-300 text-center font-medium"
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                              <span className="text-gray-400 text-xs">
                                🔒 Auto-set
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            Status automatically updates based on tracking
                            checkboxes below
                          </p>
                        </div>
                      </div>

                      {/* Empty Container Picked Up */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-5">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="empty_container_picked_up_status"
                            name="empty_container_picked_up_status"
                            value="true"
                            checked={containerTracking.emptyContainerPickedUp}
                            onChange={(e) =>
                              handleContainerTrackingChange(
                                "emptyContainerPickedUp",
                                e.target.checked
                              )
                            }
                          />
                          <Label
                            htmlFor="empty_container_picked_up_status"
                            className="text-sm font-semibold text-gray-700"
                          >
                            Empty Container Picked Up
                          </Label>
                        </div>
                        <div className="space-y-2">
                          <Label
                            htmlFor="empty_container_picked_up_date"
                            className="text-sm font-semibold text-gray-700"
                          >
                            Pick Up Date
                          </Label>
                          <Input
                            id="empty_container_picked_up_date"
                            name="empty_container_picked_up_date"
                            type="date"
                            defaultValue={
                              planData.container_tracking
                                ?.empty_container_picked_up_date
                                ? new Date(
                                    planData.container_tracking.empty_container_picked_up_date
                                  )
                                    .toISOString()
                                    .slice(0, 16)
                                : ""
                            }
                            className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          />
                        </div>
                        <div></div>
                      </div>

                      {/* Tracking Steps Grid */}
                      <div className="space-y-6">
                        {/* Container Stuffing Completed */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="container_stuffing_completed"
                              name="container_stuffing_completed"
                              value="true"
                              checked={containerTracking.stuffingCompleted}
                              onChange={(e) =>
                                handleContainerTrackingChange(
                                  "stuffingCompleted",
                                  e.target.checked
                                )
                              }
                            />
                            <Label
                              htmlFor="container_stuffing_completed"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Container Stuffing Completed
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="container_stuffing_completed_date"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Completion Date
                            </Label>
                            <Input
                              id="container_stuffing_completed_date"
                              name="container_stuffing_completed_date"
                              type="date"
                              defaultValue={
                                planData.container_tracking
                                  ?.container_stuffing_completed_date
                                  ? new Date(
                                      planData.container_tracking.container_stuffing_completed_date
                                    )
                                      .toISOString()
                                      .slice(0, 16)
                                  : ""
                              }
                              className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            />
                          </div>
                          <div></div>
                        </div>

                        {/* Gated In */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="gated_in_status"
                              name="gated_in_status"
                              value="true"
                              checked={containerTracking.gatedIn}
                              onChange={(e) =>
                                handleContainerTrackingChange(
                                  "gatedIn",
                                  e.target.checked
                                )
                              }
                            />
                            <Label
                              htmlFor="gated_in_status"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Gated In
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="gated_in_date"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Gate In Date
                            </Label>
                            <Input
                              id="gated_in_date"
                              name="gated_in_date"
                              type="date"
                              defaultValue={
                                planData.container_tracking?.gated_in_date
                                  ? new Date(
                                      planData.container_tracking.gated_in_date
                                    )
                                      .toISOString()
                                      .slice(0, 16)
                                  : ""
                              }
                              className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            />
                          </div>
                          <div></div>
                        </div>

                        {/* Loaded on Board */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="loaded_on_board_status"
                              name="loaded_on_board_status"
                              value="true"
                              checked={containerTracking.loadedOnBoard}
                              onChange={(e) =>
                                handleContainerTrackingChange(
                                  "loadedOnBoard",
                                  e.target.checked
                                )
                              }
                            />
                            <Label
                              htmlFor="loaded_on_board_status"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Loaded on Board
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="loaded_on_board_date"
                              className="text-sm font-semibold text-gray-700"
                            >
                              Loading Date
                            </Label>
                            <Input
                              id="loaded_on_board_date"
                              name="loaded_on_board_date"
                              type="date"
                              defaultValue={
                                planData.container_tracking
                                  ?.loaded_on_board_date
                                  ? new Date(
                                      planData.container_tracking.loaded_on_board_date
                                    )
                                      .toISOString()
                                      .slice(0, 16)
                                  : ""
                              }
                              className="border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            />
                          </div>
                          <div></div>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}