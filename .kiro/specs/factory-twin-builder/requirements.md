# Requirements Document

## Introduction

The Factory Twin Builder revamps the existing read-only Digital Twin page into an interactive, spatial factory setup and visualization tool. Users build their factory layout on a 2D grid, place and configure machines with custom parameters, generate QR codes for mobile data entry, connect machines with descriptive process lines, and manage inventory and dispatch panels — all through a GUI-driven flow. After setup, the factory renders as an interactive visualization with 3D box placeholders, hover summaries, and tap-to-inspect analytics.

## Glossary

- **Factory_Floor_Canvas**: The interactive 2D grid component where users place machines and draw connections. Represents the physical factory floor plan at scale.
- **Floor_Grid**: The coordinate system overlaid on the Factory_Floor_Canvas, measured in feet or meters, used to position machines spatially.
- **Machine_Node**: A configured machine placed on the Factory_Floor_Canvas, containing parameters, name, I/O definitions, custom keys, and custom KPIs.
- **Machine_Parameter**: A named key-value pair associated with a Machine_Node, where the key is a user-defined label and the value has a specified data type (number, text, boolean, date, etc.).
- **Custom_KPI**: A user-defined formula computed from one or more Machine_Parameters of the same Machine_Node.
- **Machine_QR_Code**: A generated QR code encoding a link to the platform's data entry page for a specific Machine_Node. Contains the machine name and identifier.
- **Data_Entry_Page**: A mobile-accessible page opened via Machine_QR_Code scan that presents all fields required to submit one row of observation data for the associated machine.
- **Connection_Line**: A visual and logical link drawn between two Machine_Nodes on the Factory_Floor_Canvas, representing material flow and inter-machine processes.
- **Connection_Distance**: The estimated physical distance between two connected Machine_Nodes, calculated from their grid positions and displayed on the Connection_Line during creation.
- **Factory_Builder_Dialog**: The modal dialog that initiates the factory setup flow by collecting floor dimensions and unit preferences.
- **Factory_Visualization**: The post-setup interactive view showing the saved factory layout with 3D box placeholders for machines, hover summaries, and tap-to-inspect detail panels.
- **Inventory_Panel**: A panel to the left of the Factory_Floor_Canvas representing the factory's raw material storage area, displayed as a tree map of quantities.
- **Dispatch_Panel**: A panel to the right of the Factory_Floor_Canvas representing the factory's finished goods dispatch area, displayed as a tree map of quantities.
- **Inventory_QR_Code**: A generated QR code for recording inventory changes (additions and removals) via mobile scan.
- **Dispatch_QR_Code**: A generated QR code for registering product arrival for dispatch and actual dispatch events via mobile scan.
- **Tree_Map**: A hierarchical area-based visualization showing quantities of materials or products, where rectangle size is proportional to quantity.
- **Unit_System**: The measurement system selected during factory setup (feet or meters) that governs all spatial calculations on the Floor_Grid.

## Requirements

### Requirement 1: Factory Builder Initiation

**User Story:** As a factory operator, I want to start building my factory layout from the Digital Twin page, so that I can set up my factory spatially without navigating to a separate settings area.

#### Acceptance Criteria

1. IF no factory layout has been configured, THEN THE Factory_Twin_Builder SHALL display a "Build Factory" button on the Digital Twin page.
2. WHEN the user clicks the "Build Factory" button, THE Factory_Builder_Dialog SHALL open and prompt the user for the factory floor area dimensions (width and length) as numeric values.
3. WHEN the user enters floor dimensions, THE Factory_Builder_Dialog SHALL allow the user to select the Unit_System as either feet or meters.
4. WHEN the user confirms the floor dimensions and Unit_System, THE Factory_Floor_Canvas SHALL render a Floor_Grid representing the specified width and length in the selected unit, with grid lines visible at regular intervals.
5. IF the user cancels the Factory_Builder_Dialog without confirming, THEN THE Factory_Twin_Builder SHALL close the dialog and return to the Digital Twin page with the "Build Factory" button still displayed, without creating a layout.
6. IF the user enters a width or length value that is non-numeric, zero, or negative, THEN THE Factory_Builder_Dialog SHALL display an error message indicating the dimension must be a positive number and SHALL prevent confirmation until valid values are provided.
7. IF the user enters a width or length value exceeding 10,000 in the selected unit, THEN THE Factory_Builder_Dialog SHALL display an error message indicating the dimension exceeds the maximum allowed value of 10,000 and SHALL prevent confirmation.
8. THE Factory_Builder_Dialog SHALL default the Unit_System selection to meters when first opened.

### Requirement 2: Floor Grid Setup

**User Story:** As a factory operator, I want a scaled grid representing my factory floor, so that I can accurately position machines relative to their real-world locations.

#### Acceptance Criteria

1. THE Floor_Grid SHALL render as a square-unit grid where each cell represents one square foot or one square meter based on the selected Unit_System.
2. THE Floor_Grid SHALL display axis labels at intervals of no more than 10 cells, showing cumulative distance in the selected Unit_System along both the horizontal and vertical axes.
3. THE Floor_Grid SHALL support pan and zoom interactions where zoom ranges from a minimum of 1 cell visible per viewport width to a maximum of the entire floor visible in the viewport, and panning SHALL NOT scroll beyond the floor boundary.
4. THE Factory_Floor_Canvas SHALL display the total floor dimensions (width × height) in the selected Unit_System in the header area.
5. WHILE the Factory_Floor_Canvas is in edit mode, THE Floor_Grid SHALL visually distinguish the cell under the user's cursor from surrounding cells by applying a differentiated background style to indicate the placement target.
6. WHEN the operator configures the floor dimensions, THE Floor_Grid SHALL accept width and height values between 1 and 10,000 units (in the selected Unit_System) and render the grid accordingly.
7. IF the operator enters floor dimensions outside the range of 1 to 10,000 units or provides non-numeric input, THEN THE Floor_Grid SHALL reject the input and display an error message indicating the valid range.

### Requirement 3: Machine Placement

**User Story:** As a factory operator, I want to place machines at specific positions on the floor grid, so that the digital layout mirrors the physical arrangement of equipment.

#### Acceptance Criteria

1. WHILE the Factory_Floor_Canvas is in edit mode, THE Factory_Twin_Builder SHALL allow the user to click an unoccupied grid position to initiate Machine_Node placement.
2. WHEN the user selects a grid position, THE Factory_Twin_Builder SHALL open a machine configuration panel.
3. THE machine configuration panel SHALL require the user to enter a machine name between 1 and 50 characters in length, and SHALL prevent confirmation until a valid name is provided.
4. THE machine configuration panel SHALL allow the user to define between 0 and 10 input specifications and between 0 and 10 output specifications, each consisting of a unit type and a label of 1 to 30 characters.
5. WHEN the user confirms the machine configuration, THE Factory_Twin_Builder SHALL render the Machine_Node at the selected grid position displaying its configured name.
6. IF the user selects a grid position that is already occupied by a Machine_Node, THEN THE Factory_Twin_Builder SHALL indicate that the position is unavailable and SHALL NOT open the configuration panel.
7. IF the user cancels the machine configuration panel, THEN THE Factory_Twin_Builder SHALL close the panel without placing a Machine_Node and SHALL leave the grid position unoccupied.

### Requirement 4: Machine Parameter Configuration

**User Story:** As a factory operator, I want to define custom parameters for each machine, so that I can capture the specific data points relevant to each piece of equipment.

#### Acceptance Criteria

1. THE machine configuration panel SHALL allow the user to add up to 50 Machine_Parameters per Machine_Node, each with a user-defined key name (1 to 64 alphanumeric or underscore characters) and a data type selection.
2. THE machine configuration panel SHALL support the following data types for Machine_Parameters: number, text, boolean, date, and selection (enumerated list of up to 20 options, each option label 1 to 100 characters).
3. WHEN the user adds a Machine_Parameter, THE Factory_Twin_Builder SHALL validate that the key name is unique (case-insensitive comparison) within the Machine_Node.
4. IF the user submits a Machine_Parameter with a key name that already exists within the same Machine_Node, THEN THE Factory_Twin_Builder SHALL reject the addition and display an error message indicating the key name is already in use.
5. THE machine configuration panel SHALL allow the user to remove or reorder existing Machine_Parameters.
6. WHEN a Machine_Node is saved with Machine_Parameters, THE Data_Entry_Page for that machine SHALL include a field for each defined Machine_Parameter, rendered according to its configured data type.

### Requirement 5: Custom KPI Definition

**User Story:** As a factory operator, I want to create custom KPIs for each machine using its parameters, so that I can track the performance metrics most relevant to my operation.

#### Acceptance Criteria

1. THE machine configuration panel SHALL provide an option to create Custom_KPIs for the Machine_Node, up to a maximum of 20 Custom_KPIs per Machine_Node.
2. THE Custom_KPI editor SHALL allow the user to select only numeric Machine_Parameters of the same Machine_Node as formula variables.
3. THE Custom_KPI editor SHALL allow the user to define arithmetic formulas (add, subtract, multiply, divide) combining selected Machine_Parameters, with a maximum of 10 parameter references per formula.
4. THE Custom_KPI editor SHALL require the user to specify a name (1 to 50 characters) and a display unit (1 to 20 characters) for each Custom_KPI, where the name is unique among Custom_KPIs of the same Machine_Node.
5. WHEN a Custom_KPI is saved, THE Factory_Visualization SHALL compute and display the Custom_KPI value from the latest submitted data for that Machine_Node.
6. IF a Custom_KPI formula references a Machine_Parameter with no submitted data, THEN THE Factory_Visualization SHALL display the Custom_KPI as "Unavailable" rather than computing a partial result.
7. IF a Custom_KPI formula results in a division by zero, THEN THE Factory_Visualization SHALL display the Custom_KPI as "Unavailable" rather than computing a numeric result.

### Requirement 6: QR Code Generation for Machines

**User Story:** As a factory operator, I want a QR code generated for each configured machine, so that floor staff can scan it to quickly access the data entry form for that machine.

#### Acceptance Criteria

1. WHEN a Machine_Node configuration is saved, THE Factory_Twin_Builder SHALL generate a Machine_QR_Code for that machine within 5 seconds of the save completing.
2. WHEN a Machine_Node configuration is updated and re-saved, THE Factory_Twin_Builder SHALL regenerate the Machine_QR_Code so that the encoded URL remains valid for the current Machine_Node configuration.
3. THE Machine_QR_Code SHALL encode a URL that opens the Data_Entry_Page for the associated Machine_Node, and the URL SHALL work within the platform's existing authentication flow.
4. THE Machine_QR_Code SHALL display the machine name as a human-readable label beneath the code, truncated with an ellipsis if the name exceeds 50 characters.
5. THE Factory_Twin_Builder SHALL provide a print action for the Machine_QR_Code that produces output at a minimum size of 2 cm × 2 cm to ensure scannability by standard mobile cameras.
6. WHEN the Machine_QR_Code is scanned with a mobile camera, THE platform SHALL open the Data_Entry_Page for the associated Machine_Node without requiring intermediate page navigation between scan and form display.
7. IF a Machine_QR_Code is scanned and the associated Machine_Node has been deleted, THEN THE platform SHALL display an error message indicating that the machine no longer exists and the QR code is invalid.

### Requirement 7: Mobile Data Entry via QR Scan

**User Story:** As a floor worker, I want to scan a machine's QR code and immediately see a data entry form, so that I can record observations without searching through the system.

#### Acceptance Criteria

1. THE Data_Entry_Page SHALL display all fields corresponding to the Machine_Parameters defined for the Machine_Node, in the order they were configured.
2. THE Data_Entry_Page SHALL render appropriate input controls for each Machine_Parameter data type: numeric keypad for numbers, date picker for dates, toggle for booleans, dropdown for selections, and text input for text.
3. WHEN the user submits a completed data entry form, THE platform SHALL store the submitted data as one observation row associated with the Machine_Node, including a system-generated timestamp.
4. WHEN the data submission succeeds, THE Data_Entry_Page SHALL display a success confirmation message and reset the form fields to empty for the next entry.
5. IF the user submits a form with missing required fields, THEN THE Data_Entry_Page SHALL highlight the missing fields with an error indicator and prevent submission until all required fields are populated.
6. THE Data_Entry_Page SHALL be accessible and functional on mobile devices with viewport widths of 320px and above without requiring horizontal scrolling.
7. IF the data submission fails due to a network or server error, THEN THE Data_Entry_Page SHALL display an error message and retain the entered data so the user can retry submission.

### Requirement 8: Machine Connection Drawing

**User Story:** As a factory operator, I want to draw connections between machines showing material flow, so that I can represent how products move through the factory.

#### Acceptance Criteria

1. WHILE the Factory_Floor_Canvas is in edit mode, THE Factory_Twin_Builder SHALL allow the user to initiate a connection by dragging from a connection anchor on one Machine_Node, rendering a provisional Connection_Line that follows the cursor and indicates the direction of material flow with an arrowhead pointing toward the cursor.
2. WHILE the user is dragging a Connection_Line, THE Factory_Twin_Builder SHALL display the Connection_Distance in the selected Unit_System, rounded to 1 decimal place, shown as a label attached to the midpoint of the line and updated in real time as the cursor moves.
3. WHEN the user drops the Connection_Line onto a Machine_Node that is different from the originating Machine_Node, THE Factory_Twin_Builder SHALL create a persistent Connection_Line linking the two machines with an arrowhead indicating material flow direction from source to target.
4. THE Factory_Twin_Builder SHALL allow the user to assign a name (maximum 50 characters) and a description (maximum 200 characters) to the Connection_Line.
5. THE Connection_Line configuration SHALL allow the user to define process parameters including: material type (free-text, maximum 100 characters), quantity per cycle (numeric value from 0.01 to 999,999,999.99), input specification describing what the source machine produces, and output specification describing what the target machine receives.
6. IF the user drops the Connection_Line on empty space (not on a Machine_Node), THEN THE Factory_Twin_Builder SHALL cancel the connection attempt, remove the provisional line from the canvas, and return the Factory_Floor_Canvas to its prior state without creating a Connection_Line.
7. IF the user drops the Connection_Line onto the same Machine_Node from which it originated, THEN THE Factory_Twin_Builder SHALL cancel the connection attempt without creating a Connection_Line.

### Requirement 9: Save Factory Layout

**User Story:** As a factory operator, I want to save my complete factory setup, so that it persists and is visible as an interactive visualization on subsequent visits.

#### Acceptance Criteria

1. THE Factory_Twin_Builder SHALL provide a "Save Factory" action after at least one Machine_Node has been placed on the Factory_Floor_Canvas.
2. WHEN the user triggers "Save Factory", THE Factory_Twin_Builder SHALL persist all Machine_Nodes (with their grid positions, Machine_Parameters, and Custom_KPIs), all Connection_Lines (with their parameters), and the floor dimensions and Unit_System to the backend API.
3. WHEN the factory layout is saved successfully, THE Factory_Twin_Builder SHALL transition the view from edit mode to the Factory_Visualization within 2 seconds of receiving the server success response.
4. IF the save operation fails due to a network or server error, THEN THE Factory_Twin_Builder SHALL display an error message describing the failure and SHALL retain the unsaved layout in the editor so the user can retry.
5. WHEN a user returns to the Digital Twin page after a factory has been saved, THE Factory_Visualization SHALL load and display the saved layout, including all Machine_Nodes at their saved positions and all Connection_Lines.
6. WHILE the save operation is in progress, THE Factory_Twin_Builder SHALL display a loading indicator and disable the "Save Factory" action to prevent duplicate submissions.

### Requirement 10: Factory Visualization with 3D Placeholders

**User Story:** As a factory operator, I want to see my factory rendered as an interactive visualization after setup, so that I can monitor operations at a glance.

#### Acceptance Criteria

1. THE Factory_Visualization SHALL display each Machine_Node as a 3D box placeholder at its saved grid position.
2. THE Factory_Visualization SHALL render Connection_Lines between connected Machine_Nodes with their configured names visible, truncating labels that exceed 24 characters with an ellipsis.
3. WHEN the user hovers over a Machine_Node in the Factory_Visualization, THE Factory_Twin_Builder SHALL display a summary tooltip showing the machine name, current operational status, and the three most recently updated metrics with their values.
4. WHEN the user taps or clicks a Machine_Node in the Factory_Visualization, THE Factory_Twin_Builder SHALL display a detail panel showing the latest submitted data and computed Custom_KPIs for that machine.
5. THE Factory_Visualization SHALL apply a distinct status color to each Machine_Node corresponding to its operational status, where the statuses are: running, warning, down, idle, and no_data.
6. IF a Machine_Node has no submitted data, THEN THE Factory_Twin_Builder SHALL display an empty-state message in the detail panel indicating that no data has been received yet.
7. WHEN the user long-presses a Machine_Node on a touch device, THE Factory_Twin_Builder SHALL display the same summary tooltip as the hover interaction.

### Requirement 11: Inventory Panel Setup

**User Story:** As a factory operator, I want to define my inventory storage area with capacity and raw materials, so that I can track stock levels alongside the factory floor.

#### Acceptance Criteria

1. IF inventory is not configured, THEN THE Factory_Twin_Builder SHALL display the Inventory_Panel to the left of the Factory_Floor_Canvas showing only a "Build Inventory" button and no material data.
2. WHEN the user initiates "Build Inventory", THE Factory_Twin_Builder SHALL present a configuration form allowing the user to specify the storage capacity as a numeric value between 1 and 1,000,000 with a unit of measurement selected from kilograms, litres, meters, or units.
3. WHEN the user is configuring inventory, THE Factory_Twin_Builder SHALL allow the user to define between 1 and 50 raw materials, each with a name (maximum 100 characters) and a unit of measurement selected from meters, litres, units, or kilograms, and an initial quantity between 0 and the storage capacity.
4. WHEN inventory is configured, THE Inventory_Panel SHALL render a Tree_Map visualization showing all materials as rectangles with areas proportional to their current quantity relative to the total quantity of all materials.
5. IF a material has a current quantity of zero, THEN THE Inventory_Panel SHALL display that material in the Tree_Map as a minimal-size rectangle with the material name still visible.
6. WHEN inventory is configured, THE Factory_Twin_Builder SHALL generate an Inventory_QR_Code displayed within the Inventory_Panel.
7. WHEN the Inventory_QR_Code is scanned, THE platform SHALL open a form listing all configured materials, allowing the user to select a material, choose either "addition" or "removal", and enter a quantity between 1 and the storage capacity.
8. IF the user submits a removal quantity that exceeds the material's current quantity, THEN THE platform SHALL reject the submission and display an error message indicating insufficient stock.
9. WHEN a valid inventory addition or removal is submitted via the QR form, THE Inventory_Panel SHALL update the Tree_Map visualization to reflect the new quantities within 5 seconds.

### Requirement 12: Dispatch Panel Setup

**User Story:** As a factory operator, I want to define my dispatch area with product types, so that I can track outgoing shipments alongside the factory floor.

#### Acceptance Criteria

1. IF dispatch is not configured, THEN THE Factory_Twin_Builder SHALL display the Dispatch_Panel to the right of the Factory_Floor_Canvas as an empty placeholder with a "Build Dispatch" prompt.
2. WHEN the user initiates "Build Dispatch", THE Factory_Twin_Builder SHALL allow the user to define between 1 and 50 products, each with a name of 1 to 50 characters and a unit of measurement selected from meters, litres, units, or kilograms.
3. IF the user attempts to save dispatch configuration with zero products defined, THEN THE Factory_Twin_Builder SHALL display an error message indicating that at least one product is required and SHALL NOT save the configuration.
4. WHILE dispatch is configured, THE Dispatch_Panel SHALL render a Tree_Map visualization showing all defined products with rectangle sizes proportional to their quantities awaiting dispatch (arrived but not yet dispatched).
5. WHILE dispatch is configured, THE Factory_Twin_Builder SHALL display a Dispatch_QR_Code that, when scanned, opens a mobile dispatch form.
6. WHEN the Dispatch_QR_Code is scanned, THE platform SHALL open a dispatch form allowing the user to select a dispatch event type of either "arrival for dispatch" or "actual dispatch", select a product from the configured product list, and enter a quantity between 0.01 and 999,999,999.99 in the product's defined unit.
7. THE dispatch form SHALL record the selected product type, dispatch event type (arrival or actual dispatch), quantity, unit of measurement, and a system-generated timestamp for each submitted dispatch event.
8. IF the user submits the dispatch form with a quantity outside the range of 0.01 to 999,999,999.99 or leaves a required field empty, THEN THE platform SHALL display an error message indicating the validation failure and SHALL NOT record the dispatch event.

### Requirement 13: Edit Existing Factory Layout

**User Story:** As a factory operator, I want to modify my saved factory layout, so that I can update the digital twin when physical changes occur on the floor.

#### Acceptance Criteria

1. WHEN a saved factory layout is displayed in the Factory_Visualization, THE Factory_Twin_Builder SHALL provide an "Edit Layout" action to re-enter edit mode.
2. WHILE in edit mode on an existing layout, THE Factory_Twin_Builder SHALL allow the user to move, rename, change the type of, or remove existing Machine_Nodes.
3. WHILE in edit mode on an existing layout, THE Factory_Twin_Builder SHALL allow the user to add new Machine_Nodes and Connection_Lines.
4. WHILE in edit mode on an existing layout, THE Factory_Twin_Builder SHALL allow the user to remove existing Connection_Lines.
5. WHEN a Machine_Node is removed, THE Factory_Twin_Builder SHALL remove all Connection_Lines associated with that machine.
6. IF a Machine_Node has previously submitted data and the user requests its removal, THEN THE Factory_Twin_Builder SHALL display a confirmation dialog indicating that historical data for that machine will be orphaned, and SHALL proceed with removal only upon explicit user confirmation.
7. WHILE in edit mode, THE Factory_Twin_Builder SHALL provide a "Save" action that persists all layout changes and exits edit mode, and a "Cancel" action that discards all unsaved changes and returns the layout to its last saved state.

### Requirement 14: Backend Spatial Data API

**User Story:** As a platform developer, I want backend APIs that store and retrieve spatial factory layouts, so that the frontend can persist and load factory configurations.

#### Acceptance Criteria

1. THE backend API SHALL provide an endpoint to create a new factory layout accepting floor dimensions (width and height between 1 and 10,000), Unit_System (feet or meters), and an array of Machine_Node positions with their configurations.
2. THE backend API SHALL provide an endpoint to retrieve the complete factory layout including all Machine_Nodes (positions, parameters, Custom_KPIs), Connection_Lines, inventory configuration, and dispatch configuration for the active tenant.
3. THE backend API SHALL provide an endpoint to update an existing factory layout, accepting partial or full updates to Machine_Nodes, Connection_Lines, and floor dimensions.
4. IF a create or update request contains a Machine_Node position that falls outside the defined floor dimensions, THEN THE backend API SHALL reject the request and return an error indicating which Machine_Node position is invalid.
5. IF a create or update request contains a Connection_Line that references an invalid Machine_Node identifier, THEN THE backend API SHALL reject the request and return an error indicating which Connection_Line has an invalid reference.
6. THE backend API SHALL scope all factory layout data to the active tenant, and IF a request attempts to access another tenant's layout data, THEN THE backend API SHALL return a 403 forbidden response.

### Requirement 15: QR Code Data Entry API

**User Story:** As a platform developer, I want backend endpoints for QR-initiated data submission, so that mobile users can submit machine observations and inventory/dispatch records.

#### Acceptance Criteria

1. WHEN the backend API receives a request with a valid machine identifier, THE backend API SHALL return the Data_Entry_Page field definitions including each parameter's name, data type, constraints, and display order.
2. WHEN the backend API receives an observation submission for a Machine_Node, THE backend API SHALL validate each submitted value against the configured Machine_Parameters data types and constraints, persist the observation row, and return a success response containing the created record identifier and submission timestamp.
3. IF an observation submission contains a value that does not conform to the configured Machine_Parameters data type or violates a constraint, THEN THE backend API SHALL reject the entire submission and return an error response indicating which parameter failed validation and the reason for failure.
4. WHEN the backend API receives an inventory change submission, THE backend API SHALL validate and persist the record containing material identifier, quantity delta as a non-zero numeric value between -999999999.99 and 999999999.99, direction as one of "inbound" or "outbound", and timestamp in ISO 8601 format.
5. WHEN the backend API receives a dispatch submission, THE backend API SHALL validate and persist the record containing product identifier, quantity as a positive numeric value between 0.01 and 999999999.99, unit of measure, event type as one of "dispatched" or "returned", and timestamp in ISO 8601 format.
6. IF a submission references a Machine_Node or inventory/dispatch configuration that does not exist, THEN THE backend API SHALL return an error response with a 404 status indicating which resource identifier was not found.
7. IF a QR-initiated request fails authentication or lacks valid credentials, THEN THE backend API SHALL reject the request and return an authentication error response without processing the submission.
8. THE backend API SHALL authenticate QR-initiated requests using the platform's existing authentication mechanism.
