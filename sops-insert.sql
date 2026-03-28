-- Golf Course Maintenance SOPs for Veterans Memorial GC at Great Lakes Naval Base
-- Military Installation Standards

-- MOWING SOPs (1-4)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Daily Greens Mowing Procedure',
  $$# Daily Greens Mowing Procedure

## Purpose
To establish the standard operating procedure for maintaining consistent, high-quality green surfaces at Veterans Memorial GC, ensuring optimal playing conditions and meeting military installation standards.

## Scope
This SOP applies to all greens maintenance personnel operating greens mowers on all 18 holes.

## Responsibilities
- Greens Keeper: Overall supervision and quality control
- Mowing Crew: Daily mower operation and execution
- Equipment Technician: Pre-shift equipment inspection

## Procedure

### Pre-Mowing Inspection (0600-0630 hours)
1. Conduct daily equipment inspection per Daily Equipment Inspection SOP
2. Verify mower blade sharpness using visual inspection and paper cut test
3. Check hydraulic fluid levels and top off if necessary
4. Inspect all safety shields and guards for integrity
5. Test blade engagement and disengagement controls
6. Verify fuel level and add premium fuel if below 75%

### Mowing Operations
1. Begin mowing at 0630 hours, weather permitting
2. Set blade height to 2.75 inches for bent grass greens using calibrated height gauge
3. Mow in alternating directional pattern (north-south one day, east-west the next)
4. Mow at consistent speed (approximately 2 mph) to ensure even cutting
5. Maintain consistent line spacing with no missed strips or overlaps
6. Complete each green in single continuous pass when possible
7. Walk green after mowing to verify quality and uniformity
8. Document mowing height and pattern in daily log

### Post-Mowing Tasks
1. Return mower to equipment shed
2. Clean mower deck and undercarriage to remove grass clippings
3. Refuel to 90% capacity
4. Perform post-operation inspection noting any mechanical issues
5. Report equipment defects to Equipment Technician immediately

## Safety Requirements
- Wear steel-toed boots and high-visibility vest at all times
- Never leave running mower unattended
- Keep hands and feet clear of blade area
- Disengage blades when transiting between greens
- Keep bystanders minimum 50 feet away during mowing operations

## Quality Standards
- Blade height tolerance: ±0.05 inches
- No missed spots or uneven cutting visible
- Clippings removed (no clumping)
- Consistent directional pattern maintained
- Green must be safe and playable immediately after mowing

## Documentation
- Record mowing date, time, height of cut, pattern used, and operator name in Daily Log
- Report any equipment issues or environmental concerns to Greens Keeper
- Flag any greens requiring additional maintenance for spot repairs
$$,
  'mowing',
  'sop',
  ARRAY['greens', 'mowing', 'daily', 'quality-control'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Fairway Mowing Schedule & Heights',
  $$# Fairway Mowing Schedule & Heights

## Purpose
To establish consistent fairway cutting heights and schedules that maintain playability while promoting healthy turf growth across all fairways.

## Scope
Applies to all 18-hole fairways and secondary landing areas at Veterans Memorial GC.

## Responsibilities
- Superintendent: Schedule approval and turf health assessment
- Mowing Crew: Equipment operation and execution
- Grounds Foreman: Daily schedule coordination

## Procedure

### Cutting Heights by Season
**Growing Season (April-October)**
- Primary fairways: 0.75 inches
- Secondary fairways: 0.90 inches
- Approach areas: 0.65 inches

**Dormant Season (November-March)**
- All fairways: 1.10 inches
- Maintain height through frozen periods

### Mowing Schedule

**Spring/Summer Schedule (April-October)**
1. Mow Monday, Wednesday, Friday and Saturday
2. Secondary fairways mowed Tuesday and Thursday
3. Begin operations at 0700 hours
4. Complete all fairway mowing by 1300 hours

**Fall/Winter Schedule (November-March)**
1. Mow Monday and Thursday only
2. Reduce schedule to once per week if temperatures below 40°F
3. Begin operations at 0800 hours

### Mowing Operations
1. Pre-inspect 7-gang rotary mower per Daily Equipment Inspection SOP
2. Verify all blade heights are set to tolerance using calibrated gauge
3. Operate at consistent 3.5 mph for smooth, even cuts
4. Mow in alternating directional patterns weekly to minimize wear patterns
5. Use overlapping passes to ensure complete coverage with no missed areas
6. Monitor clipping volume and adjust collection system as needed
7. Document actual cutting height, pattern, and conditions in field log

### Height Verification
1. Use calibrated height gauge at minimum 5 points per hole
2. Check height immediately after mowing and record
3. Adjust blades if variance exceeds ±0.1 inches
4. Re-check after adjustments before resuming mowing

## Safety Requirements
- Maintain 100-foot clearance from spectators and course users
- Do not operate mower on fairways during tournaments or events
- Inspect for debris (rocks, branches, foreign objects) before mowing
- Wear proper PPE including eye protection
- Use spotters when operating near cart paths

## Quality Standards
- Height of cut within tolerance
- No visible scalping or missed spots
- Even coverage across all fairways
- Clean cut (no shredding)
- Consistent clipping distribution

## Documentation
- Record date, holes mowed, cutting height, clipping volume, weather conditions
- Note any turf damage or problem areas
- Report equipment defects immediately
$$,
  'mowing',
  'sop',
  ARRAY['fairways', 'mowing', 'schedule', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Rough Mowing Standards',
  $$# Rough Mowing Standards

## Purpose
To establish and maintain appropriate rough conditions that provide course challenge while ensuring safe playability and efficient maintenance operations.

## Scope
All rough areas surrounding fairways and greens at Veterans Memorial GC.

## Responsibilities
- Superintendent: Rough height specifications
- Mowing Crew: Equipment operation
- Assistant Superintendent: Quality inspections

## Procedure

### Rough Height Standards

**Primary Rough (within 75 feet of fairway edge)**
- Growing season: 2.0-2.5 inches
- Dormant season: 2.5-3.0 inches

**Secondary Rough (beyond 75 feet)**
- Growing season: 2.5-3.0 inches
- Dormant season: 3.0-3.5 inches

**Native Areas (unmowed)**
- Maintain natural vegetation appropriate to habitat
- Clear sight lines and hazard visibility lines only

### Mowing Schedule
1. Primary rough mowed weekly (Monday/Thursday)
2. Secondary rough mowed bi-weekly (first and third Wednesday)
3. Native areas inspected monthly, mowed only as needed for sight lines
4. Adjust schedule based on growth rate and conditions

### Equipment Setup
1. Inspect rough mower and verify blade engagement
2. Adjust deck height using calibrated measurement tool
3. Verify all safety shields are in place
4. Test blade control lever movement and engagement

### Mowing Operations
1. Begin at hole 1 and work systematically through course
2. Make uniform passes maintaining consistent line spacing
3. Overlap passes by 6 inches to eliminate missed areas
4. Slow to 2.5 mph in rough to ensure clean cutting
5. Monitor mower deck for clipping accumulation
6. Clear deck if grass bunching occurs
7. Document height and conditions in daily log

### Quality Verification
1. Walk perimeter of green after mowing
2. Verify uniform height across entire rough area
3. Check for missed strips or uneven cutting
4. Ensure no damage to tee boxes or green surrounds
5. Verify sight lines are clear and safe

## Safety Requirements
- Wear long pants, boots, and protective eyewear
- Scan rough area for rocks, branches, or foreign objects before mowing
- Maintain 150-foot clearance from golfers during mowing
- Do not mow during tournament play or special events

## Quality Standards
- Uniform height within specified range
- Clean cut appearance
- No visible scalping or damage
- Grass clippings distributed evenly
- Sight lines maintained for hazard visibility

## Documentation
- Record date, holes mowed, height setting, weather conditions
- Note any hazards found (rocks, debris, damage)
- Report equipment issues immediately
$$,
  'mowing',
  'sop',
  ARRAY['rough', 'mowing', 'maintenance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Tee Box Mowing & Maintenance',
  $$# Tee Box Mowing & Maintenance

## Purpose
To maintain tee boxes in excellent condition with consistent surface quality, safety, and playability for all skill levels.

## Scope
All 18 tee boxes and practice tee areas at Veterans Memorial GC.

## Responsibilities
- Tee Box Specialist: Daily maintenance operations
- Superintendent: Height and quality standards
- Equipment Technician: Equipment maintenance

## Procedure

### Tee Box Dimensions & Layout
1. Each tee box measured and marked as Gold/Blue/White/Red
2. Tee box depth: minimum 35 feet
3. Tee box width: minimum 25 feet
4. Tee markers placed 4 yards apart in consistent positions
5. Maintain clear sight lines to fairway landing area

### Mowing Operations
1. Tee boxes mowed daily (Monday-Sunday) at 0530 hours, weather permitting
2. Set blade height to 1.0 inches for all tees using calibrated gauge
3. Mow in systematic north-south or east-west pattern
4. Maintain consistent passes with no missed areas
5. Mow at 2.0 mph for quality finish
6. Complete mowing before course opening time
7. Divot repair and topdressing completed after mowing

### Divot Repair Program
1. Inspect all tees for divots at 0600 hours
2. Fill divots with sand-seed mix in ratio 60% sand / 40% seed
3. Pack mixture firmly to prevent settling
4. Water new divots lightly with hand irrigation
5. Mark recently repaired divots with small flags if numerous
6. During growing season, divots fill within 2-3 weeks
7. Winter divots held for spring sodding if damage severe

### Tee Marker Management
1. Clean tee markers daily with damp cloth
2. Verify markers are positioned 4 yards apart
3. Rotate marker positions weekly to distribute wear
4. Repair or replace damaged markers immediately
5. Store markers indoors during winter months
6. Inspect markers for structural integrity monthly

### Surface Quality Checks
1. Walk entire tee area after mowing
2. Verify height uniformity across surface
3. Check for uneven settling or compaction areas
4. Identify any diseased turf or damage patterns
5. Document findings in daily maintenance log

## Safety Requirements
- Wear steel-toed boots and high-visibility vest
- Prevent golfer access during mowing operations
- Clear tee area of all golf balls and foreign objects before mowing
- Never mow while golfers are present on tee

## Quality Standards
- Height of cut: 1.0 inch ± 0.05 inches
- Smooth, even playing surface
- No scalping or bare spots
- Tee markers clean and properly positioned
- Divots filled and level with surrounding turf

## Documentation
- Log daily mowing date, time, height, and operator
- Record divot repairs and patterns observed
- Note any turf damage or disease symptoms
- Report equipment issues to technician
$$,
  'mowing',
  'sop',
  ARRAY['tee-boxes', 'mowing', 'daily-maintenance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- IRRIGATION SOPs (5-7)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Irrigation System Startup (Spring)',
  $$# Irrigation System Startup (Spring) Procedure

## Purpose
To safely activate and verify the irrigation system in spring, ensuring all components function properly before applying water to the course.

## Scope
Complete irrigation system including main lines, zone controllers, sprinkheads, and monitoring equipment at Veterans Memorial GC.

## Responsibilities
- Irrigation Manager: Overall system oversight and startup authorization
- Irrigation Technician: Equipment activation and testing
- Greens Crew: Zone operation monitoring

## Procedure

### Pre-Startup Inspection (March 15-31)
1. Visually inspect all above-ground components for winter damage
2. Check for broken or cracked irrigation lines at surface
3. Verify all sprinkhead caps are in place and undamaged
4. Inspect valve boxes for debris, water, or damage
5. Clear any standing water from valve boxes and low spots
6. Document any visible damage in Startup Checklist

### Main Line Pressure Testing
1. Verify main water supply valve is in CLOSED position
2. Turn water supply valve to OPEN position slowly (over 2 minutes)
3. Monitor system pressure gauge, should read 80-100 psi
4. If pressure exceeds 110 psi, close supply and notify supervisor
5. Inspect all visible line connections for leaks
6. Document starting pressure and date

### Controller System Activation
1. Verify all zone controllers are powered OFF
2. Check that all electrical connections are dry and secure
3. Turn on controller power at breaker (0700 hours)
4. Navigate to system settings and verify correct date/time
5. Load irrigation program for spring schedule
6. Verify all 18 zones registered in system

### Zone-by-Zone Testing
1. Starting with Zone 1 (Hole 1 Greens), activate manually
2. Allow zone to run for 2 minutes, observe sprinkhead operation
3. Walk zone and verify sprinkheads are operating properly
4. Check for geyser conditions or unusual spray patterns
5. Monitor sprinkhead rotation and coverage
6. Return zone to OFF position and record observations
7. Repeat for all zones (approximately 1 hour per 6 zones)
8. Note any non-functional or damaged sprinkheads for repair

### System Adjustment
1. Fine-tune sprinkhead patterns to ensure complete coverage
2. Adjust throw distance on heads requiring it
3. Clean any sprinkheads with debris or mineral deposits
4. Verify no dry spots or excessive overlap in coverage
5. Adjust pressure-regulating valve if flow too high or low
6. Re-test adjusted zones

### Monitoring Equipment Check
1. Verify soil moisture sensors are responding correctly
2. Check rain sensor functionality during test cycle
3. Verify weather station data is transmitting to system
4. Test backup irrigation timer systems
5. Confirm mobile app connectivity for remote monitoring

## Safety Requirements
- Do not test system during freeze conditions (below 32°F)
- Maintain electrical safety around controller systems
- Observe water pressure safety with all connections
- Verify all sprinkhead areas are clear of personnel during testing

## Quality Standards
- All zones operational and sprinkheads functioning
- System pressure 80-100 psi during operation
- Coverage patterns complete with no dry spots
- Monitoring systems active and accurate
- All zones respond to controller commands

## Documentation
- Complete Spring Startup Checklist
- Record pressure readings and controller activation time
- Document zone test results (operational/needs repair)
- Note any equipment repairs completed
- File startup completion sign-off by Irrigation Manager
$$,
  'irrigation',
  'sop',
  ARRAY['irrigation', 'startup', 'spring', 'system-activation'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Daily Irrigation Monitoring & Adjustment',
  $$# Daily Irrigation Monitoring & Adjustment

## Purpose
To maintain optimal irrigation scheduling based on environmental conditions, ensuring efficient water use while meeting plant health and turf quality objectives.

## Scope
Daily monitoring and adjustment of automated irrigation system at Veterans Memorial GC.

## Responsibilities
- Irrigation Manager: Schedule decisions and adjustments
- Irrigation Technician: Daily monitoring and manual adjustments
- Assistant Superintendent: Turf response evaluation

## Procedure

### Morning Monitoring (0600-0700 hours)
1. Check system control panel for error messages or alerts
2. Review overnight irrigation run duration and zones executed
3. Note rainfall amount (if rain sensor active) and temperature
4. Verify soil moisture sensor readings in key areas
5. Check water pressure gauge; should read 80-100 psi
6. Review weather forecast for next 24 hours
7. Document observations in Daily Log

### Mid-Day Inspection (1200-1300 hours)
1. Walk course observing turf moisture stress indicators
2. Observe green color and leaf turgidity
3. Check for wilting on greens, fairways, or roughs
4. Note any brown patches or stressed areas
5. Evaluate moisture at various depths using soil probe
6. Check soil moisture sensors for accuracy
7. Document findings and any stress observations

### Irrigation Adjustment Protocol
**If Turf Showing Drought Stress:**
1. Increase irrigation cycle length by 15-20%
2. Add additional morning cycle if stress significant
3. Increase syringing on greens if needed
4. Verify water is reaching root zone (6-8 inches depth)
5. Adjust schedule 24 hours and monitor response

**If Overwatering Indicated (excess moisture, soft greens, algae):**
1. Reduce cycle length by 15%
2. Skip scheduled afternoon cycle if applicable
3. Verify drainage is functioning properly
4. Reduce frequency if possible (skip days)
5. Monitor turf response for 48 hours

**If Rainfall Occurs:**
1. Check rain gauge for total accumulation
2. Reduce next irrigation cycle by amount of rainfall received
3. Example: 0.5 inches rain = skip first 15 minutes of scheduled cycle
4. Re-evaluate based on weather forecast

### Seasonal Adjustments

**Spring Schedule (April-May)**
- Increase irrigation frequency as temperatures warm
- Typical schedule: Greens 60-90 minutes daily, Fairways 4x weekly
- Monitor rainfall and adjust accordingly

**Summer Schedule (June-August)**
- Maximum irrigation during heat stress period
- Greens: 120-150 minutes daily (split into 2-3 cycles)
- Fairways: Daily 90-120 minutes
- Activate syringing on greens during extreme heat

**Fall Schedule (September-October)**
- Gradually reduce irrigation as temperatures drop
- Decrease frequency by 20-30% from summer schedule
- Monitor rainfall closely as fall rains increase

**Winter Schedule (November-March)**
- Minimize irrigation; rely primarily on precipitation
- Dormant grass requires minimal water
- Irrigation 2x weekly only if extended dry period occurs

### Equipment Monitoring
1. Verify all zone valves are responding to controller commands
2. Check for broken or clogged sprinkheads (visual inspection)
3. Monitor system pressure for leaks (pressure gauge trending)
4. Test backup systems weekly
5. Verify controller battery backup is functional

## Safety Requirements
- Never enter valve boxes or underground structures
- Maintain electrical safety around controller systems
- Use proper procedures for pressure release when needed

## Quality Standards
- Turf maintains adequate moisture without overwatering
- System pressure consistent at 80-100 psi
- All zones operational and responding to commands
- Soil moisture within optimal range (50-70% saturation)
- No runoff or water waste observed

## Documentation
- Record daily temperature, rainfall, and adjustments made
- Log irrigation cycle times and water application amounts
- Note turf response and any stress observations
- Document equipment issues or repairs
- Update weather patterns for seasonal analysis
$$,
  'irrigation',
  'sop',
  ARRAY['irrigation', 'daily-monitoring', 'adjustment', 'maintenance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Irrigation System Winterization',
  $$# Irrigation System Winterization

## Purpose
To properly shut down and protect the irrigation system for winter conditions, preventing freeze damage to lines, valves, and equipment.

## Scope
Complete irrigation system winterization at Veterans Memorial GC for cold-weather shutdown.

## Responsibilities
- Irrigation Manager: Winterization planning and authorization
- Irrigation Technician: Equipment shutdown and drainage
- Grounds Crew: Valve box inspection and protection

## Procedure

### Pre-Winterization Planning (October 15-31)
1. Review weather forecast for first frost date in region
2. Schedule winterization for 1 week before anticipated first frost
3. Verify all repair work is completed before shutdown
4. Obtain all necessary winterization materials and equipment
5. Brief all crew members on winterization procedures

### System Shutdown (November 1-7)
1. Set irrigation controller to OFF position at main breaker
2. Close main water supply valve completely
3. Allow system to sit for 15 minutes
4. Open drain valves at lowest points in system
5. Verify water is draining from all low-point drains
6. Allow complete drainage before proceeding (may require 1-2 hours)

### Line Purging with Compressed Air
1. Connect compressed air source (minimum 80 psi, maximum 120 psi)
2. Set pressure regulator to 100 psi
3. Beginning at Zone 1, open zone valve and blow air through lines
4. Listen for continuous air flow; water should stop after 30-45 seconds
5. Continue air purge for 2 minutes per zone to ensure complete drainage
6. Close zone valve and move to next zone
7. Repeat for all 18 zones systematically

### Sprinkhead Winterization
1. After air purging, visually inspect all sprinkheads in each zone
2. Sprinkheads should be dry with no visible water
3. Remove any sprinkhead caps and inspect for water
4. If water present, allow zone to drain further
5. Replace sprinkhead caps securely
6. Mark any sprinkheads requiring repair in spring

### Valve Box Protection
1. Inspect all valve boxes for cracks or damage
2. Raise all valve box covers and verify boxes are dry inside
3. If water is present, allow drainage and investigate source
4. Place foam insulation blocks in any valve boxes with above-ground valve components
5. Close valve box covers securely
6. Mark any valve boxes requiring maintenance attention

### Controller System Shutdown
1. Set all zone timers to OFF
2. Power down controller at main breaker
3. Verify all indicator lights are dark
4. Leave breaker in OFF position for winter
5. Protect controller from weather (close any cabinet doors)
6. Remove mobile app remote access authorization if desired

### Main Water Supply
1. Locate main water supply valve (typically at course entry)
2. Turn valve to OFF position with 90-degree rotation
3. Verify valve is fully closed (no water flow from drain)
4. Place weatherproof lock on valve handle to prevent accidental opening
5. Document valve location and lock placement

### Documentation
1. Complete Winterization Checklist with all zones verified
2. Record date of winterization and crew involved
3. Note any equipment damage or repairs needed
4. Document final system pressure reading (should be 0 psi)
5. Create spring startup checklist based on winterization notes

### Spring Reactivation Checklist
- Verify all lines are clear of water and debris
- Check for any evidence of freeze damage or leaks
- Inspect all sprinkheads for winter damage
- Verify electrical connections are dry
- Test system per Irrigation System Startup (Spring) SOP

## Safety Requirements
- Wear safety glasses when using compressed air
- Verify compressed air source is properly maintained and filtered
- Do not exceed 120 psi during air purge operations
- Ensure area is clear of personnel during pressurized air operations

## Quality Standards
- All zones completely drained of water
- No water visible in valve boxes or at low points
- All sprinkheads confirmed dry
- Main water supply secure and locked
- System documentation complete

## Documentation
- Complete and file Winterization Checklist
- Record any damage or issues found
- Note equipment requiring repair or replacement
- Document crew members involved and completion date
- File photos of winterization completion if major issues found
$$,
  'irrigation',
  'sop',
  ARRAY['irrigation', 'winterization', 'seasonal', 'shutdown'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- CHEMICAL SOPs (8-11)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Pesticide Application Procedure',
  $$# Pesticide Application Procedure

## Purpose
To establish safe, effective procedures for applying pesticides to turf areas while protecting personnel, course users, and the environment.

## Scope
All pesticide applications including insecticides, fungicides, and plant growth regulators at Veterans Memorial GC.

## Responsibilities
- Pesticide Applicator (Certified): Product selection and application
- Safety Officer: PPE verification and spill response
- Superintendent: Application approval and record keeping

## Procedure

### Pre-Application Planning
1. Identify pest or disease problem requiring treatment
2. Verify pesticide is labeled for identified pest on turf
3. Determine application rate based on product label and affected area
4. Verify Environmental Protection Agency (EPA) registration and label
5. Check weather forecast; do not apply within 24 hours of rain
6. Select application method: boom sprayer, handheld, or granular spreader

### Personnel Requirements
1. Applicator must hold valid pesticide applicator certification
2. Assistant must be trained in pesticide safety procedures
3. Require OSHA 30-hour certification for all applicators
4. Maintain current training records
5. Brief all course personnel of pesticide application schedule

### Personal Protective Equipment (PPE) Preparation
1. Inspect PPE for tears, damage, or contamination
2. Put on long pants, long-sleeved shirt, and boots
3. Don chemical-resistant gloves (nitrile minimum)
4. Put on protective eyewear or face shield
5. Don respiratory protection if label requires (P100 cartridge minimum)
6. Verify respirator seal by performing fit test
7. Have safety shower/eyewash station accessible

### Equipment Preparation
1. Inspect sprayer for leaks or damage
2. Verify spray nozzles are clean and properly sized
3. Fill sprayer tank with water only first
4. Test spray pattern in designated area (not on course)
5. Adjust pressure and nozzle settings
6. Empty test water and inspect for leaks

### Chemical Mixing and Loading
1. Place pesticide container on flat, stable surface
2. Calculate required amount based on affected area (in square feet)
3. Measure pesticide using calibrated measuring cup (never hands)
4. Add pesticide to sprayer tank slowly while stirring
5. Add appropriate amount of water per label directions
6. Maintain proper dilution ratio per label (typically 1:10 to 1:100)
7. Secure tank lid and shake gently for 30 seconds
8. Never exceed tank capacity

### Application Procedures
1. Application begins minimum 2 hours before dawn or sunset
2. No application if rain forecast within 24 hours
3. Keep all non-essential personnel at least 200 feet from application area
4. Apply using smooth, overlapping passes
5. Maintain consistent speed (approximately 3 mph)
6. Adjust nozzle height for complete coverage (typically 18-24 inches)
7. Monitor application pattern visually
8. For spot treatments, mark area and isolate from course use

### Spray Coverage Verification
1. Walk perimeter of treated area after application
2. Verify even coverage with no missed spots
3. Check for excessive runoff or pooling
4. Inspect plants for visible residue or coverage
5. Document coverage quality in application record

### Post-Application Activities
1. Stop application and rinse sprayer thoroughly immediately
2. Fill sprayer tank with water
3. Flush all lines by spraying water on designated area
4. Repeat rinse cycle minimum 3 times
5. Return sprayer to equipment shed
6. Remove PPE carefully, avoiding contamination
7. Place PPE in designated contamination bag for cleaning
8. Wash exposed skin with soap and water immediately
9. Change into clean clothes

### Site Notification
1. Post warning signs at treated area entry points
2. Signage must state "PESTICIDE APPLIED - KEEP OUT" with application date
3. Include pesticide product name and application time
4. Provide re-entry interval based on product label (typically 24 hours)
5. Maintain signs for minimum 24-hour period

## Safety Requirements
- All applicators must be EPA-certified pesticide applicators
- Always wear required PPE per product label
- Never eat, drink, or smoke during application
- Never apply if wind speed exceeds 10 mph
- Verify respiratory protection fitted correctly before use
- Keep antidote available for organophosphate products
- Maintain MSDS (Material Safety Data Sheet) in accessible location

## Quality Standards
- Application rate per product label specifications
- Even coverage across treated area
- No spots missed or unintentionally treated
- Proper re-entry interval maintained (minimum 24 hours)
- Documentation complete and accurate

## Documentation
- Complete Pesticide Application Record with:
  - Date and time of application
  - Product name and EPA registration number
  - Application rate and total volume applied
  - Area treated (square footage)
  - Applicator name and certification number
  - Weather conditions at application
  - Re-entry interval and safety notifications
- Maintain records for minimum 2 years per EPA requirements
- Report any adverse effects observed post-application
$$,
  'chemical',
  'sop',
  ARRAY['pesticide', 'chemical-application', 'safety', 'epa-compliance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Fertilizer Application Schedule',
  $$# Fertilizer Application Schedule

## Purpose
To maintain optimal turf nutrition through consistent, scheduled fertilizer applications based on soil testing and seasonal growth patterns.

## Scope
Fertilizer applications to greens, fairways, roughs, and tee boxes at Veterans Memorial GC.

## Responsibilities
- Superintendent: Program design and approval
- Fertilizer Applicator: Equipment operation and execution
- Turf Agronomist: Soil testing and recommendations

## Procedure

### Annual Soil Testing Program
1. Collect soil samples in spring (March-April) from representative areas
2. Sample from 8-10 locations per turf area type (greens, fairways, roughs)
3. Collect samples to 2-inch depth using soil probe
4. Combine samples in plastic bucket and mix thoroughly
5. Deliver 1-pound samples to certified soil testing laboratory
6. Receive results within 2 weeks with fertilizer recommendations
7. Review results with Agronomist and adjust program as needed

### Spring Fertilization (April-May)
**Greens (April 15 - May 15)**
- Apply 0.5 pounds nitrogen (N) per 1,000 square feet
- Use slow-release formulation (sulfur-coated urea, polymer-coated)
- Total greens area: approximately 3 acres
- Application rate: 1.5 pounds product per 1,000 sq ft
- Spreader setting: mid-range (verify with test application)

**Fairways (April 1 - May 1)**
- Apply 0.75 pounds nitrogen per 1,000 square feet
- Use balanced NPK ratio 10-8-6 or similar
- Total fairways area: approximately 95 acres
- Application: 7-8 pounds product per 1,000 sq ft
- Use 7-gang spreader for efficiency

**Roughs (May 1 - May 15)**
- Apply 0.5 pounds nitrogen per 1,000 square feet
- Lower fertility acceptable for rough areas
- Total rough area: approximately 50 acres
- Application: 4-5 pounds product per 1,000 sq ft

**Tee Boxes (April 15 - May 1)**
- Apply 0.75 pounds nitrogen per 1,000 square feet
- Use quality turf formulation with micronutrients
- Each tee box: 1,000 square feet approximately
- Total: 18 applications using rotary spreader

### Summer Maintenance (June-August)
**Greens (Bi-weekly applications)**
- Week 1: 0.25 pounds nitrogen per 1,000 sq ft
- Week 3: Micronutrient spray application (iron, manganese)
- Week 5: 0.25 pounds nitrogen per 1,000 sq ft
- Alternate between soluble and slow-release products
- Monitor color and adjust as needed

**Fairways (Monthly applications)**
- June 15: 0.5 pounds nitrogen per 1,000 sq ft
- July 15: 0.5 pounds nitrogen per 1,000 sq ft
- August 15: 0.25 pounds nitrogen per 1,000 sq ft (reduced)
- Use foliar spray if heat stress observed

**Tee Boxes & Roughs (Monthly)**
- Single application per month at 0.25-0.5 lbs N per 1,000 sq ft
- Tee boxes: monthly, roughs: every 6 weeks

### Fall Fertilization (September-October)
**All Areas (September 1 - October 15)**
- Transition to higher potassium (K) formulations
- Greens: 0.5 lbs N, 0.5 lbs K per 1,000 sq ft
- Fairways: 0.75 lbs N, 1.0 lbs K per 1,000 sq ft
- Roughs: 0.5 lbs N, 0.75 lbs K per 1,000 sq ft
- Promotes winter hardiness and root development

### Winter Program (November-March)
**Dormant Season (November 1 - March 31)**
- Minimal fertilizer application
- One light application in November at 0.25 lbs N per 1,000 sq ft
- Pre-emergence herbicide-fertilizer combinations acceptable
- No applications if ground frozen

### Application Procedures
1. Verify spreader settings with test application on pavement
2. Fill spreader hopper with measured amount of fertilizer
3. Apply using overlapping passes with consistent speed (3-4 mph)
4. For granular: match spreader width to application
5. For liquid: apply at specified pressure (typically 25-40 psi)
6. Complete application and water in within 24 hours if rainfall not expected
7. Return equipment to shed and clean spreader thoroughly

### Quality Control
1. Observe turf color response within 5-7 days
2. Green color should deepen within 1-2 weeks
3. Growth rate should increase appropriately
4. No visible burn or damage should occur
5. Clipping volume should increase 15-20% after application

## Safety Requirements
- Wear gloves when handling fertilizer products
- Avoid inhalation of dust; wear mask if needed
- Prevent runoff into water sources
- Keep fertilizer away from streams and water features
- Wash hands before eating or drinking
- Store fertilizer in dry location away from moisture

## Quality Standards
- Application rate per soil test recommendations
- Even distribution with no missed spots or overlaps
- Proper timing based on growth stage and season
- Turf response visible within 7-10 days
- Nitrogen budget tracked and recorded

## Documentation
- Record application date, product name, rate applied
- Document turf area treated and square footage
- Note weather conditions at application
- Record spreader settings used
- Track soil test results and recommendations
- Maintain fertilizer inventory and usage records
$$,
  'chemical',
  'sop',
  ARRAY['fertilizer', 'nutrition', 'application', 'seasonal', 'soil-testing'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Pre-Emergent Herbicide Program',
  $$# Pre-Emergent Herbicide Program

## Purpose
To control seasonal weed growth through timely application of pre-emergent herbicides that prevent seed germination without harming established turf.

## Scope
All turf areas at Veterans Memorial GC including greens, fairways, roughs, and tee boxes.

## Responsibilities
- Superintendent: Program schedule and product selection
- Pesticide Applicator: Application execution
- Grounds Crew: Timing coordination and water management

## Procedure

### Spring Pre-Emergent Program (March-May)

**Crabgrass Pre-Emergent (First Application)**
- Timing: When soil temperature reaches 50°F for 3 consecutive days
- At Veterans Memorial GC: typically March 20-April 5
- Product: Dithiopyr or pendimethalin-based formulation
- Application rate: Follow product label (typically 0.75-1.5 lbs product per 1,000 sq ft)

**Application Sequence:**
1. Check 7-day soil temperature forecast
2. When 50°F threshold is projected, schedule application
3. Apply to greens, fairways, and tee boxes
4. Apply to roughs after fairway mowing
5. Water in with 0.5 inch irrigation within 24 hours
6. No mowing for 48 hours after application

**Second Crabgrass Application**
- Timing: 4 weeks after first application (typically April 20-May 5)
- Use different active ingredient (e.g., if first was dithiopyr, use pendimethalin)
- Prevents resistance buildup
- Same application procedures as first application
- Water in within 24 hours

### Summer Weed Prevention (June-August)

**Goosegrass Control (Northern crabgrass)**
- Timing: Late spring as soil temps approach 70°F
- Typically June 1-June 15
- Product: Fenoxaprop or annual bluegrass herbicide
- Greens only: 0.5 lbs product per 1,000 sq ft
- Fairways: 0.75 lbs product per 1,000 sq ft

**Summer Broadleaf Suppression**
- Timing: July 15-August 15
- Product: Low-rate broadleaf herbicide post-emergent
- Optional depending on observed weed pressure
- Spot treatment if weeds scattered, full course if >10% coverage

### Fall Pre-Emergent Program (August-October)

**Winterweed Pre-Emergent**
- Timing: August 20-September 15
- Product: Pendimethalin or benefin-based formulation
- Controls winter annuals (chickweed, henbit, local weeds)
- Application rate: 1.0-1.5 lbs product per 1,000 sq ft
- Apply before rainfall preferred; water in if dry

**Application procedures:**
1. Apply to all turf areas: greens, fairways, roughs, tees
2. Coverage must be uniform with no missed spots
3. Water in with 0.25-0.5 inch irrigation if no rain within 48 hours
4. Mowing acceptable 48 hours post-application

### Application Equipment & Methods

**Spreader Setup for Granular Products**
1. Calibrate spreader on pavement using measured area
2. Fill hopper with measured weight of product
3. Push spreader in straight lines across turf area
4. Maintain consistent speed (3-4 mph)
5. Overlap passes by 6 inches to prevent gaps
6. Collect and measure collected product, compare to expected distribution

**Spray Application for Liquid Products**
1. Fill spray tank with water first
2. Measure product per label directions
3. Add product to tank while agitating
4. Set sprayer pressure to 30-50 psi
5. Apply in overlapping passes for complete coverage
6. Verify pattern before treating large area

### Post-Application Management
1. Water in application within 24 hours if rainfall not forecast
2. Use 0.25-0.5 inch irrigation or rainfall equivalent
3. No mowing for 48 hours after application
4. Do not apply if heavy rain forecast (would wash product off)
5. Avoid foot traffic on treated areas for 24 hours

### Monitoring & Effectiveness
1. Observe for weed germination 2-3 weeks post-application
2. Crabgrass should show minimal emergence if effective
3. Winter weeds should be reduced by 80-90% come fall
4. Document any breakthroughs or weed escapes
5. Adjust product or timing next season if less than 80% effective

### Resistance Management
1. Rotate herbicide active ingredients annually
2. First year: Dithiopyr for crabgrass
3. Second year: Pendimethalin for crabgrass
4. Third year: Return to dithiopyr with different product formulation
5. Never use same chemistry in consecutive years

## Safety Requirements
- All applicators must follow Pesticide Application Procedure SOP
- Wear appropriate PPE per product label
- Prevent drift to non-target areas
- Keep product away from water features and storm drains
- Maintain 200-foot buffer from water sources

## Quality Standards
- Application rate per product label and soil type
- Complete, even coverage across treated areas
- Weed control effectiveness 80%+ by next season
- No damage to desirable turf or plants
- Water management prevents product washoff

## Documentation
- Record application date and time
- Document product name, active ingredient, rate applied
- Note coverage area (square footage)
- Record weather conditions and soil temperature
- Log weed control effectiveness 30 days post-application
- Track rotation of herbicide active ingredients
$$,
  'chemical',
  'sop',
  ARRAY['herbicide', 'weed-control', 'pre-emergent', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Chemical Storage & Handling',
  $$# Chemical Storage & Handling

## Purpose
To establish safe storage, inventory, and handling procedures for all pesticides and fertilizers, protecting personnel, environment, and course integrity.

## Scope
All chemical products stored and used at Veterans Memorial GC including pesticides, fertilizers, and plant growth regulators.

## Responsibilities
- Superintendent: Inventory oversight and product approval
- Chemical Supervisor: Storage facility management
- All Personnel: Safe handling and reporting

## Procedure

### Chemical Storage Facility Requirements
1. Dedicated, secure building or locked cabinet for storage
2. Location: Isolated from course, maintenance areas, and water sources
3. Minimum 200 feet from groundwater wells or surface water
4. Well-ventilated with windows and exhaust fan
5. Concrete floor with secondary containment (berm or spill kit available)
6. Shelving organized by product type and toxicity
7. Emergency eyewash station within 50 feet
8. Fire extinguisher rated for chemical fires (Class B or ABC)
9. Emergency contact information posted on facility door
10. No food, drink, or smoking materials in facility

### Product-Specific Storage Requirements

**Pesticides (Insecticides, Fungicides)**
- Store in original labeled containers only
- Never transfer to unmarked containers
- Separate by chemical type (don't mix incompatible products)
- Keep away from alkaline fertilizers
- Store in cooled area if recommended on label (typically 50-75°F)
- Organize by application method (granular separate from liquid)

**Fertilizers**
- Store in original bags with labels visible
- Keep dry; prevent exposure to moisture
- Organize by nitrogen content and season of use
- Granular and liquid products in separate areas
- Stack bags on pallets, not directly on floor
- Ensure good air circulation

**Herbicides**
- Store separately from other chemicals
- Keep all herbicides in dedicated cabinet or section
- Organize by type (pre-emergent, post-emergent, non-selective)
- Label all containers clearly with product name and date received

### Inventory Management
1. Maintain chemical inventory spreadsheet with:
   - Product name and EPA registration number
   - Quantity on hand (units: lbs, gallons, etc.)
   - Date received and expiration date
   - Location in storage facility
   - Cost and purchase date
2. Conduct monthly inventory count (first Friday of each month)
3. Compare physical count to spreadsheet
4. Investigate discrepancies over 5% variance
5. Order replacement products before current stock expires
6. Rotate stock: First In - First Out (FIFO) rotation

### Material Safety Data Sheet (MSDS) Management
1. Maintain MSDS for every product in current use
2. Store MSDS in binder in main facility office
3. Also keep copy posted in chemical storage facility
4. Update MSDS within 30 days of product purchase
5. Make MSDS available to all personnel upon request
6. Review MSDS with new applicators before first use

### Product Receiving & Documentation
1. Verify product upon delivery:
   - Correct product name matches purchase order
   - Containers intact with no damage or leaks
   - Label information legible and complete
   - Expiration date at least 12 months in future
2. Reject damaged or expired products
3. Document receipt in inventory log with date
4. File purchase invoice for record keeping
5. Store product in designated location immediately

### Personal Protective Equipment (PPE) & Safety
1. All personnel must review product label before handling
2. Wear gloves when handling any concentrated product
3. Use eye protection in storage facility
4. Do not touch face, eat, or drink while handling products
5. Wash hands thoroughly before leaving facility
6. Change clothes if contaminated; wash contaminated clothing separately
7. Report any spills or exposures immediately to supervisor

### Chemical Disposal Procedures
1. Never dispose of chemicals in trash or water systems
2. Contact local environmental authority for disposal options
3. Unused product: Return to supplier or licensed disposal contractor
4. Empty containers: Rinse 3 times and recycle if allowed
5. Spilled product: Contain with absorbent material, dispose with hazardous waste
6. Maintain disposal documentation for compliance records

### Spill Response
1. Alert all personnel in area immediately
2. Move non-essential personnel to safe distance
3. Put on full PPE including respiratory protection if needed
4. Assess spill size:
   - Small spill (less than 1 gallon): Apply absorbent material, contain and dispose
   - Large spill (more than 1 gallon): Evacuate area, contact hazmat team
5. Prevent spill from reaching storm drains or water sources
6. Clean contaminated soil; remove to 6-inch depth if major spill
7. Document spill: date, product, quantity, cause, response
8. Report to environmental agency if required by law

### Temperature & Environmental Control
1. Monitor storage temperature daily (record on checklist)
2. Maintain 50-75°F temperature range if possible
3. Ensure good ventilation to prevent vapor accumulation
4. Keep humidity controlled to prevent product deterioration
5. Inspect facility monthly for leaks, cracks, or damage
6. Repair any damage immediately

### Security & Access Control
1. Storage facility locked when unattended
2. Only trained personnel allowed access
3. Maintain list of authorized personnel
4. Sign out/in log for chemical access tracking
5. Investigate any unauthorized access attempts
6. Change locks if access is compromised

## Safety Requirements
- All pesticide applicators certified before using any chemicals
- MSDS review mandatory for all products before use
- PPE required per product label specifications
- Respiratory protection available for all applicators
- First aid kit and eyewash accessible near storage
- Emergency contact numbers posted and accessible

## Quality Standards
- All products properly labeled and organized
- Inventory records accurate within 5%
- MSDS current and accessible
- Storage facility properly maintained and secure
- No expired products in use
- Temperature and environmental controls functioning

## Documentation
- Maintain inventory spreadsheet with monthly updates
- Keep MSDS for all products
- Document all receipts and deliveries
- File spill reports and disposal documentation
- Record equipment inspections and maintenance
- Track all personnel access to chemical storage
$$,
  'chemical',
  'sop',
  ARRAY['chemical-storage', 'safety', 'inventory', 'hazard-communication'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- Continuing with remaining SOPs in next section...
-- EQUIPMENT SOPs (12-14)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Daily Equipment Inspection & Pre-Start Checklist',
  $$# Daily Equipment Inspection & Pre-Start Checklist

## Purpose
To ensure all golf course maintenance equipment is in safe, operational condition before daily use, preventing breakdowns and safety hazards.

## Scope
All motorized equipment including mowers, tractors, sprayers, and vehicles used in course maintenance.

## Responsibilities
- Equipment Operator: Pre-start inspection execution
- Equipment Technician: Repair and maintenance
- Superintendent: Weekly equipment status review

## Procedure

### Pre-Start Inspection Timing
1. Inspection conducted 30 minutes before equipment use
2. All equipment inspected before first use each day
3. Equipment not used within 72 hours requires full inspection
4. If equipment failure occurs, full inspection required before reuse

### Visual Inspection Checklist

**External Components**
1. Examine mower deck for visible damage, cracks, or bent components
2. Inspect tire condition:
   - Check for punctures, bulges, or uneven wear
   - Verify adequate tread depth (minimum 2/32 inches)
   - Confirm tire pressure at specification (check manufacturer label)
3. Examine all guards and safety shields for integrity
4. Look for fuel or hydraulic fluid leaks under equipment
5. Verify all fasteners are present and tight
6. Check for debris (grass, dirt) buildup that could cause overheating

**Fluid Level Checks**
1. Engine Oil:
   - Locate dipstick and extract fully
   - Wipe clean and reinsert to bottom
   - Remove and check level
   - Oil level should be between MIN and MAX marks
   - Add SAE 30W or manufacturer-recommended oil if low
   - Never overfill

2. Hydraulic Fluid:
   - Locate hydraulic sight glass or dipstick
   - Fluid should be at marked level (typically between minimum and maximum)
   - Color should be amber/red (not dark brown, indicating contamination)
   - If below minimum, add hydraulic fluid per manufacturer spec
   - Report if fluid is dark or smells burned

3. Fuel:
   - Verify fuel tank is at least 50% full
   - Add premium fuel for mowers (not regular gasoline)
   - For diesel equipment, use ultra-low sulfur diesel only
   - Check fuel cap is secure
   - Never operate equipment on empty tank

4. Radiator Coolant:
   - Check when engine is cold
   - Coolant should be at full line on expansion tank
   - Color should be green or orange (depends on type); not rusty
   - Add coolant if low (typically 50/50 mix with distilled water)

### Functional Checks

**Engine Start**
1. Turn ignition to OFF position
2. Engage all safety switches (deck clutch OFF, blades disengaged)
3. Turn key to START position and crank engine
4. Engine should start within 10 seconds without hesitation
5. Let engine warm up for 30 seconds at idle
6. If engine cranks repeatedly without starting, STOP and report to technician

**Control System Function**
1. Test blade engagement lever (deck clutch):
   - Move lever from OFF to ON position
   - Blades should engage with audible click
   - Blades should be clearly visible turning
   - Return to OFF; blades should stop promptly
2. Test forward/reverse motion:
   - Move transmission lever to FORWARD
   - Equipment should move forward smoothly
   - Return to NEUTRAL
   - Move to REVERSE
   - Equipment should move backward
   - Test parking brake engagement
3. Test steering:
   - Turn steering wheel full left, then full right
   - Movement should be smooth with no grinding noises
   - Return to center

**Safety System Checks**
1. Engine shutoff switch:
   - Pull kill switch; engine should stop immediately
   - Release; engine should start normally
2. Operator presence switch:
   - Sit on equipment seat and ensure it's detected as occupied
   - Rise off seat; engine should die within 5 seconds
   - Sit back down; engine should restart normally
3. Blade brake function:
   - Engage blades and let run for 5 seconds
   - Disengage blades
   - Blades should stop rotating within 5 seconds

**Sound & Smell Check**
1. Listen for unusual noises:
   - Grinding, squealing, knocking, or grinding indicate problems
   - Smooth hum is normal
2. Smell for unusual odors:
   - Burning smell indicates overheating or electrical problem
   - Fuel smell from tank area is normal; from engine is not
3. Observe fluid levels under equipment:
   - No new fluid accumulation should occur during warm-up

### Daily Equipment Log
1. Record equipment identification (make, model, serial number)
2. Note inspection date and time
3. Record operator's name conducting inspection
4. Document any issues found (fluid levels, damage, maintenance needs)
5. Note engine run time (if applicable)
6. Sign off inspection as APPROVED or REQUIRES MAINTENANCE

### Issues Found - Response Protocol

**Minor Issues (can operate with monitoring)**
- Oil low but above minimum
- Fuel below 50% but above 25%
- Small fluid leak (less than 1 drip per minute)
- Action: Add fluid, note in log, schedule maintenance within 48 hours

**Significant Issues (equipment out of service)**
- Oil below minimum mark
- Fuel below 25%
- Hydraulic fluid contaminated or below level
- Blade engagement not functioning properly
- Safety systems not responding
- Visible damage to critical components
- Action: Do not operate. Report to technician immediately. Mark equipment OUT OF SERVICE.

**Critical Issues (immediate hazard)**
- Steering not responding
- Brakes not functioning
- Blades not disengaging
- Operator presence system not working
- Engine will not start after 3 cranks
- Action: Lock equipment, notify supervisor immediately, do not attempt repair

### Post-Operation (End of Shift)
1. Clean equipment deck and undercarriage
2. Remove grass clippings from mower
3. Inspect for any new damage from day's use
4. Refuel to 90% capacity for next day
5. Park in designated area and secure
6. Note any issues in equipment log for technician review

## Safety Requirements
- Never perform inspection alone (buddy system)
- Engine OFF for all inspection except startup test
- Disengage all moving parts before maintenance
- Never place hands or feet under equipment
- Report all safety system failures immediately

## Quality Standards
- All fluid levels within acceptable range
- All safety systems functional
- Equipment starts on first or second crank
- No unusual noises or odors
- No active fluid leaks during operation

## Documentation
- Complete Daily Equipment Inspection Checklist
- Record any maintenance needs identified
- Sign off as APPROVED or OUT OF SERVICE
- Report critical issues to supervisor immediately
$$,
  'equipment',
  'sop',
  ARRAY['equipment', 'inspection', 'daily-checklist', 'maintenance', 'safety'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Equipment Maintenance Schedule',
  $$# Equipment Maintenance Schedule

## Purpose
To establish preventive maintenance schedules that maximize equipment life, minimize downtime, and ensure reliable operation of all golf course maintenance equipment.

## Scope
All motorized equipment at Veterans Memorial GC including mowers, tractors, irrigation equipment, and support vehicles.

## Responsibilities
- Equipment Technician: Maintenance execution and scheduling
- Superintendent: Equipment tracking and budget management
- Operators: Daily pre-start inspections and reporting issues

## Procedure

### Maintenance Categories

**Routine Maintenance (performed by operators)**
- Daily: Pre-start inspection, fluid level checks, cleaning
- Weekly: Oil changes, filter cleaning, battery inspection
- Monthly: Deep cleaning, bolt tightening, bearing inspection

**Scheduled Maintenance (performed by technician)**
- Every 50 hours: Oil change, fuel filter replacement
- Every 100 hours: Belt inspection, hydraulic system check
- Every 200 hours: Blade replacement, deck service, tire rotation
- Every 500 hours: Transmission service, bearing replacement, hose inspection
- Annually: Complete overhaul if equipment is 3+ years old

**Preventive Maintenance Program**

### Equipment-Specific Schedules

**GREENS MOWERS (4 units)**
- Maintenance Interval: Every 40-50 operating hours
- Daily: Blade sharpness inspection, deck cleaning
- Weekly: Oil level, belt tension, tire pressure
- Every 50 hours:
  - Oil and oil filter change (SAE 30W)
  - Fuel filter replacement
  - Air filter inspection (replace if visibly dirty)
  - Blade sharpness check (sharpen or replace)
  - Hydraulic fluid check
- Every 100 hours:
  - Complete blade replacement
  - Mower deck service and bearing inspection
  - Transmission fluid check and top-off
  - Tire inspection and pressure adjustment
- Every 200 hours:
  - Mower deck removal and thorough cleaning
  - Blade shaft bearing replacement if worn
  - Complete brake system inspection
  - Electrical system check
- Annual (off-season):
  - Engine overhaul or certified pre-owned replacement
  - Deck straightness check (max 1/8 inch variance)
  - Completely replace worn deck components

**FAIRWAY MOWERS (2 units, 7-gang rotary)**
- Maintenance Interval: Every 75-100 operating hours
- Daily: Engine oil check, blade deck inspection, tire pressure
- Weekly: All fluid levels, belt inspection, bearing grease points
- Every 75 hours:
  - Oil and filter change
  - Fuel filter replacement
  - Air filter replacement
  - All seven deck blade inspection and sharpening
- Every 150 hours:
  - Transmission fluid and filter replacement
  - All belts replacement (if original equipment)
  - Wheel bearing repack and lubrication
  - Brake system complete inspection and adjustment
- Every 300 hours:
  - Engine overhaul or replacement
  - Hydraulic system complete flushing
  - Complete deck refurbishment with blade replacement

**ROUGH MOWER (1 unit, commercial rotary)**
- Maintenance Interval: Every 100 operating hours
- Daily: Engine check, blade inspection, hydraulic fluid level
- Weekly: All fluids, bearing lubrication, belt tension
- Every 100 hours:
  - Oil and filter change
  - Fuel filter replacement
  - Blade sharpening or replacement
  - Air filter replacement
  - Tire pressure and condition inspection
- Every 200 hours:
  - Blade replacement (all cutting edges)
  - Belt replacement
  - Bearing repack with lithium grease
  - Transmission fluid replacement
- Every 400 hours:
  - Engine overhaul or replacement
  - Complete hydraulic system replacement
  - Deck straightness verification and adjustment

**IRRIGATION EQUIPMENT**
- System Pressure Test: Monthly (80-100 psi normal range)
- Sprinkhead Inspection: Monthly (visual, look for damage)
- Valve Box Inspection: Quarterly (check for leaks, corrosion)
- Filter Cleaning: Every 2 weeks during irrigation season
- Controller Battery Test: Quarterly (should hold 24+ hours)
- Winterization and Spring Startup: Seasonal per specific SOP

**TRACTORS (2 units)**
- Maintenance Interval: Every 100-150 operating hours
- Daily: Engine oil, coolant, hydraulic fluid, fuel level
- Weekly: Tire pressure, belt tension, bearing grease
- Every 100 hours:
  - Oil and filter change
  - Fuel filter replacement
  - Air filter check and replace if needed
  - Hydraulic fluid level and condition
- Every 250 hours:
  - Complete transmission fluid change
  - All hoses inspection and replacement if cracked
  - Brake system inspection and adjustment
  - Tire rotation and pressure equalization
- Every 500 hours:
  - Engine overhaul or professional evaluation
  - Hydraulic system complete flushing
  - Transmission rebuild or replacement if worn

### Maintenance Documentation
1. Maintain equipment maintenance log for each unit:
   - Equipment ID and serial number
   - Date of maintenance
   - Type of maintenance performed
   - Materials used (oil, filters, belts, etc.)
   - Technician name and signature
   - Operating hours at time of service
2. Create master maintenance schedule (monthly view)
3. Track upcoming maintenance items
4. Document cost of each maintenance event

### Seasonal Maintenance Schedules

**Spring Preparation (March-April)**
- Deep clean all equipment
- Oil change on all mowers
- Blade sharpening and inspection
- Belt replacement if worn
- Tire inspection and replacement if needed
- Irrigation system startup testing

**Summer Intensified Maintenance (June-August)**
- Oil changes every 40-50 hours (shorter intervals in heat)
- Daily blade sharpness inspection
- Hydraulic fluid inspections (overheating risk)
- More frequent air filter changes
- Bearing lubrication more frequent

**Fall Preparation (September-October)**
- Engine oil change to winter-grade oil (if applicable)
- Hydraulic fluid change
- Belt inspection and replacement
- Battery inspection and replacement
- Winterization of irrigation system

**Winter Storage & Maintenance (November-March)**
- Oil change before storage
- Fuel stabilizer addition
- Battery tender connection (all equipment)
- Equipment covered and stored indoors
- Implement off-season maintenance list
- Equipment inspection before spring startup

### Maintenance Standards & Tolerances
- Oil changes: Use only manufacturer-specified grade
- Filter replacement: Always use OEM or equivalent quality
- Blade sharpness: Paper-cut test (clean cut, not tearing)
- Tire pressure: Per manufacturer specification ±2 psi
- Belt tension: Slip test (should not slip under load)
- Blade height tolerance: ±0.05 inches verified with gauge

### Emergency Maintenance
- Equipment failure during operating season: Technician responds within 2 hours
- Critical equipment repair: Backup equipment deployed if primary not repairable within 24 hours
- Parts ordering: Emergency parts from regional suppliers (next-day delivery if needed)
- Loaner equipment: Request from other military installations if critical need

## Safety Requirements
- Only trained, certified technicians perform maintenance
- Equipment secured with key-off and blade engaged before service
- All moving parts locked out per OSHA procedures
- Hydraulic pressure released before opening lines
- Never work alone on equipment maintenance

## Quality Standards
- All maintenance performed by certified technicians
- Original equipment manufacturer (OEM) parts used or equivalent
- Maintenance logs complete and accurate
- Equipment downtime minimized through preventive approach
- All equipment operational before course opening

## Documentation
- Maintain equipment maintenance logs for each unit
- Create master maintenance schedule (monthly)
- Track maintenance costs vs. budget
- Document equipment condition assessments
- File inspection reports and certifications
$$,
  'equipment',
  'sop',
  ARRAY['equipment', 'maintenance', 'preventive-maintenance', 'schedule'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Fuel Storage & Handling',
  $$# Fuel Storage & Handling

## Purpose
To establish safe procedures for storing, handling, and dispensing fuel for golf course equipment, protecting personnel and the environment.

## Scope
All fuel types used at Veterans Memorial GC including gasoline, diesel, and propane for equipment operation.

## Responsibilities
- Fuel Manager: Inventory and storage oversight
- Equipment Operators: Proper fuel handling and reporting
- Superintendent: Safety compliance verification

## Procedure

### Fuel Storage Facility Requirements
1. Fuel stored in dedicated, secure, outdoor location
2. Storage area minimum 100 feet from buildings and water sources
3. Located downhill and downgradient from potable water
4. Secondary containment (double-walled tank or berm) required
5. Containment volume minimum 110% of largest tank capacity
6. Storage tanks labeled clearly: GASOLINE, DIESEL, or PROPANE
7. No smoking signs posted at all storage areas
8. Fire extinguishers (Class B) accessible within 50 feet
9. Ground and bonding cables connected during fuel transfer
10. Spill kit (absorbent material, disposal bags) at facility

### Fuel Types and Specifications

**Gasoline (for mowers and small equipment)**
- Grade: Regular unleaded 87 octane minimum, premium 91+ recommended for mowers
- Ethanol content: Maximum 10% (E10); avoid E15 or E85
- Fuel stability: Should be used within 30 days of purchase if no stabilizer added
- Storage: Indoor tank with secondary containment; keep cap secure
- Cost: Track pricing to monitor equipment fuel economy

**Diesel (for tractors and large equipment)**
- Grade: Ultra-Low Sulfur Diesel (ULSD) per EPA standards
- No gasoline contamination allowed
- Seasonal: Winter blend (Nov-Mar) for cold climates, summer blend (Apr-Oct)
- Storage: Separate tank from gasoline; clearly marked
- Filter replacement: Required if contamination occurs or water present

**Propane (if used for irrigation heaters or other equipment)**
- Type: Liquefied Petroleum Gas (LPG)
- Storage: Only in dedicated propane cylinders (not homemade containers)
- Supplier: Contract with certified propane distributor
- Delivery: Professional fill service only; never self-service

### Fuel Tank Management

**Tank Capacity and Inventory**
- Gasoline tank: 500-gallon capacity
- Diesel tank: 1000-gallon capacity
- Propane: 250+ gallon vessel
- Maintain minimum 25% reserve; order fuel when reaching 25% level
- Maintain maximum 90% full to allow for thermal expansion

**Monthly Inventory Count**
1. Conduct fuel inventory on first business day of each month
2. Record tank gauge reading or measure with depth stick
3. Calculate volume from gauge/measurement using tank capacity chart
4. Compare to fuel purchase records
5. Investigate discrepancies greater than 5% (possible leak)
6. Document inventory in log with date and inspector name

**Fuel Quality Testing**
- Visual inspection: Color should be clear (gasoline) or light amber (diesel)
- Smell test: No unusual odors (rotten eggs smell indicates sulfur contamination)
- Water testing: Monthly check using water-detection paste on dipstick
- If water present: Stop use, notify technician, arrange for fuel disposal and tank cleaning

### Fuel Transfer and Dispensing Procedures

**Pre-Transfer Preparation**
1. Verify receiving container (fuel can, equipment tank) is clean and dry
2. Ensure fuel container cap is present and functional
3. Perform visual inspection of fuel color and clarity
4. Verify receiving equipment fuel door is closed until ready
5. Ground all equipment by connecting bonding cable from tank to dispenser

**Dispensing Process**
1. Open fuel tank door on equipment
2. Slowly open fuel dispenser valve
3. Direct pump nozzle into fuel opening
4. Monitor fuel level to prevent overfilling
5. Stop when fuel reaches 2 inches below top of tank (allow thermal expansion)
6. Close fuel dispenser valve
7. Replace fuel cap securely on equipment
8. Close fuel tank door
9. Document fuel dispensed in equipment log (quantity and type)

**Container Filling**
1. Place portable fuel container on flat, stable surface
2. Ground container if metal (connect bonding cable)
3. Open container cap fully (not partially)
4. Insert pump nozzle fully into container
5. Fill to no more than 90% capacity of container
6. Remove nozzle and replace container cap securely
7. Allow 15 seconds for fumes to clear before handling
8. Carry container carefully to equipment

### Safety Procedures During Fuel Handling

**Personal Precautions**
1. Never smoke, create sparks, or use open flames near fuel
2. Wear nitrile gloves when handling fuel (neoprene for extended contact)
3. Avoid skin contact; wash immediately if exposed
4. Avoid inhalation of fuel vapors; work in ventilated area
5. Wear eye protection to prevent splashing
6. Change clothes if fuel spills on them
7. Keep antidote/first aid information accessible

**Equipment Safety**
1. Engine OFF during all fuel handling
2. Fuel dispenser and receiving containers at least 10 feet from engine
3. No running equipment within 50 feet of fuel storage area
4. Static electricity prevention: maintain ground connection during transfer
5. Keep fire extinguisher accessible during fuel transfer

### Spill Response

**Small Spill (less than 5 gallons)**
1. Alert personnel in area
2. Move away from spill
3. Activate spill kit
4. Contain spill with absorbent material (sand, kitty litter, commercial absorbent)
5. Place absorbed material in hazardous waste bag
6. Verify no fuel reached storm drains or groundwater
7. Clean area with soap and water
8. Document spill: date, amount, cause, cleanup action

**Large Spill (more than 5 gallons)**
1. Evacuate area immediately
2. Alert supervisor and base environmental officer
3. Contact fire department (non-emergency line)
4. No flame or spark sources within 300 feet
5. Close storm drain if near spill location
6. Place signs warning of spill hazard
7. Allow professionals to handle cleanup
8. File spill report per military environmental regulations

### Tank Maintenance and Inspection
1. Inspect above-ground tanks monthly for visible damage
2. Check for rust, dents, or corrosion on tank exterior
3. Verify all connections are tight and not leaking
4. Inspect secondary containment structure quarterly
5. Clean secondary containment of debris
6. Inspect filter separator system if installed
7. Drain water from filter separator every 30 days
8. Replace fuel filters annually per maintenance schedule
9. Professional tank inspection required every 5 years
10. Document all inspections with date and findings

### Record Keeping
1. Maintain fuel purchase receipts
2. Log all fuel dispensing with:
   - Date and time
   - Equipment fueled
   - Fuel type and amount
   - Operator name
3. Track fuel inventory monthly
4. Document all spills or contamination issues
5. Keep maintenance records for storage equipment
6. Retain all records for minimum 3 years

## Safety Requirements
- Fuel handling prohibited during thunderstorms
- No smoking within 100 feet of fuel storage or handling
- Static grounding required for all fuel transfers
- Emergency eyewash and spill kit immediately available
- Personnel trained in spill response procedures

## Quality Standards
- Fuel remains within acceptable color and clarity standards
- No water contamination in fuel
- Inventory accurate within 5%
- Storage facility secure and properly maintained
- All equipment properly fueled before operation begins

## Documentation
- Maintain monthly inventory log
- Document all fuel purchases with cost tracking
- Record spill incidents with response details
- File tank inspection reports (monthly/annual)
- Keep fuel quality testing results
$$,
  'equipment',
  'sop',
  ARRAY['fuel', 'storage', 'handling', 'safety', 'environmental-protection'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- GREENS SOPs (15-17)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Greens Aerification Procedure',
  $$# Greens Aerification Procedure

## Purpose
To perform necessary aerification of putting greens that relieves soil compaction, improves drainage and root development, and maintains healthy turfgrass.

## Scope
All 18 putting greens at Veterans Memorial GC.

## Responsibilities
- Superintendent: Aerification timing and approval
- Aerification Crew: Equipment operation and execution
- Assistant Superintendent: Quality verification and recovery management

## Procedure

### Aerification Schedule

**Spring Aerification (Primary)**
- Timing: Mid-April to early May
- Growth stage: Bentgrass actively growing, soil warming
- Weather: Mild temperatures, adequate soil moisture (not waterlogged)
- Recovery time: 4-6 weeks before tournament play

**Fall Aerification (Secondary)**
- Timing: Early September to mid-September
- Growth stage: Bentgrass beginning growth as temps cool
- Weather: Temperatures 60-75°F, soil not saturated
- Recovery time: 3-4 weeks before play restrictions lifted

**Summer Aerification (Light)**
- Light core aerification early August if needed
- Full aerification NOT performed June-July (heat stress risk)
- Solid tine aerification preferred over core in summer

### Pre-Aerification Preparation

**Green Inspection and Mapping**
1. Walk all 18 greens 2 weeks before planned aerification
2. Identify wet or poorly draining areas
3. Note heavy traffic patterns and compacted areas
4. Mark areas requiring priority aerification
5. Document any problem areas for superintendent review

**Soil Moisture Assessment**
1. Conduct soil moisture probe test on 3 locations per green
2. Proper moisture: soil ball forms when squeezed but crumbles easily
3. Too wet: soil muddy and holds shape; delay aerification 3-5 days
4. Too dry: soil hard and crumbly; irrigate 24-48 hours before

**Equipment Preparation**
1. Verify aerifier is in operating condition
2. Coring depth set to 2.5 inches for bentgrass greens
3. Spacing between holes: 2.5 inches (optimal for bentgrass)
4. Clear debris from equipment before operation
5. Inspect aerifier tines/cores for damage or dullness

**Topdressing Material Procurement**
1. Order sand/soil mix 1 week before aerification
2. Mix composition: 100% washed sand (preferred) or 80% sand / 20% soil mix
3. Quantity needed: Calculate as 0.15 cubic yards per 1,000 sq ft of green
4. Total for 3 acres: approximately 20 cubic yards
5. Stockpile topdressing at convenient location near greens

### Aerification Operations

**Day 1: Core Aerification**
1. Begin at 0600 hours (early morning, before heat)
2. Start with Hole 1 green
3. Operate aerifier in two directional passes (north-south, then east-west)
4. Overlap passes by 6 inches for complete coverage
5. Core removal: cores should appear on surface
6. Continue through all 18 greens systematically
7. Expected duration: 2-3 hours for all greens

**Hole Evaluation**
1. Cores should be uniform, 2.5 inches long, sand and soil visible
2. Approximately 12-16 holes per square foot (standard density)
3. No areas missed or with sparse holes
4. Dry cores indicate insufficient moisture (postpone recovery)
5. Wet cores indicate excellent soil health

**Immediate Post-Aerification**
1. Allow cores to dry on surface 24 hours (no removal day-of)
2. If rain expected, cores removed next morning to prevent consolidation
3. Cores may be driven over or fragmented by light raking

**Day 2-3: Core Removal and Dressing**

**Core Breakup**
1. Use light drag mat or drag broom to break up dried cores
2. Drag across green surface in multiple directions
3. Cores should break into small pieces and work into grass
4. Heavy dragging can damage living turf; use light pressure

**Topdressing Application**
1. Calculate topdressing needed per green (typically 20-30 pounds per 1,000 sq ft)
2. Deliver topdressing to green using hopper or similar
3. Spread evenly using topdressing spreader or broom
4. Application rate: 1/4 inch depth coverage
5. Spread multiple passes for even distribution
6. Topdressing should not smother grass blade tips

**Topdressing Incorporation**
1. Use light drag broom or mat to work dressing into surface
2. Drag in multiple directions for uniform incorporation
3. Allow 48 hours for settling before high-traffic use
4. Light watering may assist incorporation if dry conditions

### Post-Aerification Management

**Recovery Timeline**
- Days 1-3: Cores remain, topdressing applied
- Days 4-7: Grass begins growth in holes, cores fully decomposed
- Days 8-14: Holes begin filling in, traffic restricted
- Days 15-21: Minimal hole visibility, greens playable with caution
- Days 22-30: Full recovery, normal green conditions restored

**Maintenance During Recovery**
1. Greens remaining open for play (advisory signs recommended)
2. Mowing height raised 0.25 inches higher than normal during recovery
3. Mowing in one direction only (avoid cross-passes that catch blades)
4. Light rolling to firm surface if not already firm
5. Syringing on warm days to promote grass growth
6. Avoid heavy topdressing or fertilizer during recovery

**Traffic Management**
1. Mark greens with "AERIFIED - PLAY WITH CAUTION" signs
2. Recommend play reduced to morning hours for first 2 weeks
3. Tournaments and major events rescheduled 3 weeks post-aerification
4. Reduce cart traffic on greens during recovery

**Watering Program**
1. Maintain consistent moisture (do not oversaturate)
2. Syringing to 0.25 inches twice daily if temperatures exceed 75°F
3. Evening irrigation as needed for moisture maintenance
4. Reduce irrigation if excessive moisture prevents drainage

### Quality Standards for Aerification
- Hole density: 12-16 holes per square foot
- Hole depth: 2.5 inches uniform across green
- Cores: Visible sand/soil, not pure thatch
- Coverage: No bare spots or missed areas
- Timing: Completed within 3-day window for consistency

## Safety Requirements
- Operate aerifier on even, smooth greens only
- Do not operate if aerifier becomes stuck (could tip)
- Keep bystanders clear of equipment during operation
- Ensure operator has proper training on equipment use

## Quality Standards
- All 18 greens aerified within same 3-day period
- Hole distribution uniform across green surface
- Cores broken and incorporated into topdressing
- Full recovery achieved within 3-4 weeks
- Green speed and quality restored by week 4

## Documentation
- Record aerification dates for all 18 holes
- Document hole density and depth achieved
- Note topdressing material used and quantity
- Record any drainage issues or problem areas observed
- Update green maintenance log with recovery timeline
$$,
  'greens',
  'sop',
  ARRAY['greens', 'aerification', 'maintenance', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Greens Topdressing Program',
  $$# Greens Topdressing Program

## Purpose
To maintain optimal putting green surface through consistent topdressing applications that improve root zone composition, drainage, and playing conditions.

## Scope
All 18 putting greens at Veterans Memorial GC.

## Responsibilities
- Superintendent: Program approval and material specifications
- Grounds Crew: Topdressing application and incorporation
- Technician: Material testing and quality verification

## Procedure

### Annual Topdressing Program

**Total Annual Requirement**
- Bentgrass greens: 40-50 cubic yards total per year
- Breakdown: Spring 30%, Summer 30%, Fall 40%
- Quantities based on 3-acre green complex

**Material Specifications**
- Primary: 100% washed, medium silica sand (preferred for bentgrass)
- Alternative: 90% sand / 10% soil mix with organic matter
- Grain size: 0.25mm - 1.0mm (medium to coarse sand)
- No clay, silt, or organic matter unless specified
- Particle distribution: Tested by soil analysis lab

**Topdressing Sources**
- Preferred supplier: Certified golf course topdressing supplier
- Material testing: Confirm PSD (particle size distribution) annually
- Cost: Budget $3,000-4,000 annually for material
- Delivery: Stockpile at convenient location with good drainage

### Spring Topdressing Program (March-May)
1. Begin after spring green-up but before aerification
2. Weekly applications: 4-5 applications total over 6 weeks
3. Application rate: 0.05 inch depth per application (15 lbs per 1,000 sq ft)
4. Equipment: Use topdressing spreader for even distribution
5. Incorporate using light drag mat or broom
6. Total spring application: 0.25 inch depth

### Summer Maintenance Topdressing (June-August)
1. Reduced frequency: 1 application per 2 weeks
2. Light applications: 0.03 inch depth per application
3. Timing: Apply on cooler days (avoid 90°F+ temperatures)
4. Purpose: Fill holes, smooth surface, modify rootzone
5. Total summer application: 0.15 inch depth

### Fall Topdressing Program (September-November)
1. Increase frequency: Bi-weekly applications
2. Heavier applications: 0.06 inch depth per application
3. Timing: Begin when night temperatures cool
4. Promote root development before winter
5. Fill aerification holes post-aerification
6. Total fall application: 0.36 inch depth

### Winter Topdressing (December-February)
1. Minimal application only if needed
2. One light application in January if weather permits (above 40°F)
3. Purpose: Smooth surface for winter play
4. Application rate: 0.02 inch depth only
5. Allow drying before application if snow/moisture present

### Application Procedure

**Pre-Application Preparation**
1. Verify topdressing material on site and inspect quality
2. Check moisture content (should be dry, not wet)
3. Calculate application rate for green area
4. Prepare spreader and ensure even distribution
5. Notify golf operations of topdressing activity

**Spreading Technique**
1. Divide green into sections if large
2. Apply material evenly across entire green surface
3. Spreader setting: Verify on pavement first before green
4. Walking speed: Consistent 3-4 mph for even distribution
5. Multiple passes: Cross-hatching pattern (north-south, then east-west)
6. Avoid concentrating topdressing near edges or low spots

**Incorporation**
1. Allow topdressing to settle 2-4 hours (depends on weather)
2. Use drag mat or light broom to incorporate into grass
3. Drag in multiple directions for uniform distribution
4. Push material into surface to avoid exposed areas
5. Light rolling may be performed if surface too fluffy
6. Avoid heavy incorporation that buries grass blade

**Post-Application**
1. Return spreader to equipment shed
2. Document application in maintenance log
3. Schedule next topdressing application
4. Monitor weather; if heavy rain within 24 hours, reapply later
5. Observe greens for settling; apply additional topdressing if patches appear bare

### Quality Control

**Application Quality Verification**
1. Walk green after application
2. Visual inspection for even coverage
3. No bare spots where sand too thin
4. No buildup where sand too thick
5. Grass blades visible through topdressing (not buried)

**Material Quality Testing**
1. Conduct particle size distribution (PSD) test annually
2. Electrical conductivity test to ensure no salt contamination
3. pH testing (should be near neutral 6.5-7.5)
4. Organic matter content (should be minimal, less than 2%)
5. Compaction test to verify proper sand gradation

**Green Response Evaluation**
1. Monitor green speed (stimpmeter readings)
2. Observe turf color and health after application
3. Check for waterlogging or drainage problems
4. Assess surface firmness and playability
5. Document issues for material supplier communication

### Troubleshooting

**Issue: Uneven topdressing application**
- Solution: Verify spreader calibration on pavement
- Adjust walking speed for consistency
- Make additional pass if coverage too thin

**Issue: Excessive organic matter in topdressing**
- Solution: Request certified sand from supplier
- Switch to alternative supplier if repeated issue
- Request documentation of material source

**Issue: Greens not draining properly**
- Solution: Reduce topdressing frequency
- Verify sand particle size (may be too fine)
- Check subsurface drainage system
- Consider aerification if compaction severe

**Issue: Material cost increasing**
- Solution: Source alternative suppliers
- Consider bulk purchasing to reduce cost
- Evaluate alternative materials (sand/soil blends)
- Calculate exact application rates to minimize waste

## Safety Requirements
- Wear dust mask when handling dry topdressing material
- Avoid prolonged inhalation of sand dust
- Keep topdressing material away from water sources
- Stockpile location must have good drainage

## Quality Standards
- Application rate consistent per specifications
- Even distribution across all green surface
- PSD verified annually for material specifications
- No material contamination (salt, clay, organic matter)
- Green quality and speed maintained or improved

## Documentation
- Maintain application log with date, material used, rate applied
- Record supplier and material batch number
- Document green response (speed, quality observations)
- Track material costs and usage
- File annual material testing results (PSD, pH, conductivity)
$$,
  'greens',
  'sop',
  ARRAY['greens', 'topdressing', 'maintenance', 'rootzone-management'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Green Speed Management (Stimpmeter)',
  $$# Green Speed Management (Stimpmeter)

## Purpose
To maintain consistent, fair putting conditions by monitoring and managing green speed using the Stimpmeter, the industry standard for green speed measurement.

## Scope
All 18 putting greens at Veterans Memorial GC.

## Responsibilities
- Superintendent: Target green speed setting and approval
- Green Speed Technician: Daily Stimpmeter measurements
- Greens Crew: Maintenance adjustments based on speed targets

## Procedure

### Green Speed Standards and Targets

**Target Green Speeds for Veterans Memorial GC**
- Tournament conditions: 11.0-12.0 feet (Stimpmeter reading)
- Regular play conditions: 9.5-10.5 feet
- Minimum playable speed: 8.0 feet (below this, course closed to play)
- Maximum safe speed: 13.0 feet (above this, greens unplayable)

**Speed Variation by Season**
- Spring (April-May): 9.5-10.5 feet (growth season)
- Summer (June-August): 8.5-9.5 feet (heat stress season)
- Fall (September-October): 10.0-11.0 feet (optimal season)
- Winter (November-March): 8.0-9.0 feet (dormant grass)

### Stimpmeter Use and Measurement

**Equipment Setup**
1. Stimpmeter is 36-inch aluminum channel
2. Place on level area of green (avoid slopes initially)
3. Align channel straight and level
4. Ensure no debris or damp grass in channel path

**Measurement Procedure**
1. Select 5 measurement locations on green:
   - Center of green
   - Near front edge
   - Near back edge
   - Left side
   - Right side
2. Avoid highly trafficked areas for initial readings
3. For each location:
   - Set stimpmeter level with ball at notch
   - Release ball and allow it to roll down channel
   - Mark where ball exits channel
   - Measure distance from channel end to ball stop
   - Record distance in feet
4. Perform 2 rolls in each direction (uphill and downhill)
5. Average all measurements for green speed

**Reading Documentation**
- Record all 10 measurements (5 locations × 2 directions)
- Average the readings: total ÷ 10 = green speed
- Document date, time, and stimpmeter reader
- Note any green conditions affecting accuracy
- Flag unusually fast or slow areas

### Daily Green Speed Monitoring

**Timing of Measurements**
1. Primary measurement: 0900 hours daily (after morning mowing/rolling)
2. Secondary check: 1500 hours (before afternoon play)
3. If speeds changing rapidly: Hourly measurements
4. Record in Daily Green Speed Log

**Interpretation of Results**
- Increase from previous day: Investigate for cause
  - Drier conditions, less clipping, firmer surface
  - Mower blade height may have increased
  - Rolling activity more intensive
  - Reduce mowing height or irrigation

- Decrease from previous day: Investigate for cause
  - Wetter conditions, excess clipping, softer surface
  - Mower blade height may have decreased
  - Excessive traffic compacting surface
  - Increase mowing height and/or reduce clipping

### Speed Adjustment Methods

**To Increase Green Speed (if below target)**

1. **Reduce Mowing Height**
   - Lower blade height by 0.05 inches
   - Re-measure after 24 hours
   - Maximum reduction: 0.25 inches per week
   - Monitor turf health (no scalping)

2. **Increase Mowing Frequency**
   - Add extra mowing cycle (typically 1 additional mow)
   - Reduces clipping accumulation
   - Improves ball roll

3. **Increase Rolling Program**
   - Add weighted roller pass after mowing
   - Firms surface, increases speed
   - Frequency: Once daily if needed for speed

4. **Reduce Irrigation**
   - Decrease water application by 20%
   - Drier greens roll faster
   - Maintain playability (minimum soil moisture)

5. **Reduce Nitrogen Fertilizer**
   - Lower clipping production
   - Slower, finer grass growth
   - Requires 2-3 weeks to see effect

**To Decrease Green Speed (if above target)**

1. **Increase Mowing Height**
   - Raise blade height by 0.05 inches
   - Re-measure after 24 hours
   - Monitor appearance (tall, shaggy)

2. **Reduce Mowing Frequency**
   - Skip one mowing cycle per week
   - More grass material on surface
   - Slower ball roll

3. **Increase Clipping Removal**
   - Collect clippings after mowing
   - Clippings slow ball roll
   - Reduces speed 0.5-1.0 feet typically

4. **Increase Irrigation**
   - Increase water by 15-20%
   - Wetter surface = slower speed
   - Maintain plant health

5. **Increase Rolling Frequency**
   - Reduce rolling passes per week
   - Less firm surface = slower speed

6. **Increase Nitrogen Fertilizer**
   - More clipping production
   - Increased surface roughness
   - Takes 2-3 weeks to show effect

### Speed Adjustment Timeline

**Initial Adjustment**
- Week 1: Make single adjustment (one variable change)
- Measure daily for response
- Allow 48-72 hours to see effect
- If insufficient, add second adjustment

**Monitoring Adjustment**
- Continue daily measurements
- Track trends toward target
- Small incremental adjustments
- Avoid over-correcting

**Stabilization**
- Once target speed achieved, maintain conditions
- Continue daily monitoring
- Make small adjustments as needed
- Target ±0.3 feet variance from target

### Special Conditions

**Extreme Weather**
- Heavy rain: Greens slow temporarily (may close if too wet)
- Heat/drought: Greens speed up (manage irrigation carefully)
- Freeze/thaw: Greens unpredictable (close if unsafe)

**Tournament Preparation**
- Increase target speed to 11.0-12.0 feet 2 weeks prior
- Gradual changes to avoid plant stress
- Stabilize speed 1 week before event
- Monitor hourly during tournament

**Equipment Failures**
- If rolling equipment unavailable: Adjust mowing height instead
- If mowing equipment fails: Manual speed adjustments more difficult
- Prioritize maintaining target range over perfection

### Seasonal Adjustments

**Spring Green-Up (April-May)**
- Speeds naturally slower (thick growth)
- Target 9.5-10.5 feet
- Avoid chasing high speeds during growth
- Focus on consistency and playability

**Summer Heat (June-August)**
- Speeds can spike in heat
- Target 8.5-9.5 feet
- Increase irrigation for health
- Reduce mowing height cautiously

**Fall Recovery (September-October)**
- Optimal season for speed management
- Target 10.0-11.0 feet achievable
- Best playing conditions
- Use as baseline for course quality

**Winter Dormancy (November-March)**
- Dormant grass plays slow
- Target 8.0-9.0 feet acceptable
- Avoid aggressive changes during dormancy
- Focus on surface playability

## Safety Requirements
- Stimpmeter operation performed on level ground only
- Do not throw or drop stimpmeter (precision instrument)
- Store in protective case when not in use
- Calibrate stimpmeter annually with manufacturer

## Quality Standards
- Daily measurements taken at consistent time
- Five measurement locations per green minimum
- Speed variation between greens: ±0.5 feet maximum
- Speed targets met within ±0.3 feet
- Consistency more important than exact speed

## Documentation
- Maintain Daily Green Speed Log for all 18 greens
- Record all measurements and conditions
- Document adjustments made and response
- Track trends over season for pattern analysis
- Compare year-to-year for consistency
$$,
  'greens',
  'sop',
  ARRAY['greens', 'green-speed', 'stimpmeter', 'quality-control'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- BUNKER SOPs (18-19)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Daily Bunker Maintenance',
  $$# Daily Bunker Maintenance

## Purpose
To maintain all course bunkers in excellent condition with firm, consistent surfaces and safe playing conditions.

## Scope
All 52 bunkers at Veterans Memorial GC (approximately 6-8 bunkers per 9-hole section).

## Responsibilities
- Bunker Crew: Daily maintenance execution
- Superintendent: Quality standards and frequency approval
- Assistant Superintendent: Quality inspection

## Procedure

### Bunker Maintenance Schedule

**Daily Maintenance (Monday-Sunday)**
1. Bunker raking and surface preparation
2. Divot repair and sand replacement
3. Edge trimming and cleanup
4. Debris removal and surface inspection

**Weekly Deep Cleaning (Friday)**
1. Bunker edging along entire perimeter
2. Remove compacted sand layer (if present)
3. Add fresh sand to low spots
4. Firm and level entire bunker bottom

**Monthly Renovation (First Friday)**
1. Bunker bottom raking and re-leveling
2. Edge reconstruction (if eroded)
3. Sand depth verification and adjustment
4. Drainage inspection

### Daily Raking Procedure

**Equipment**
- Bunker rakes (4 required - 2 hand rakes, 2 large maintenance rakes)
- Sand bucket for divot fill
- Sand spreader for topdressing

**Raking Technique**
1. Begin at bunker entry point
2. Rake entire bunker bottom with large maintenance rake
3. Even out all footprints and ball marks
4. Break up any compacted areas
5. Smooth sand to uniform level
6. Ensure no ridges or holes remain
7. Rake bunker edges to clean

**Pattern**
1. Always rake in consistent pattern (typically from entry toward back)
2. Rake lines should be smooth and even
3. Final rake pass creates "prepared" appearance
4. Sand should show clear rake marks (not scattered)

**Quality Check**
1. Walk bunker after raking completion
2. Verify no footprints or ball marks visible
3. Check for even sand depth (minimum 3 inches throughout)
4. Inspect edges for cleanliness

### Divot Repair in Bunkers

**Identification**
- Divot: Hole created by ball strike or footstep
- Compacted area: Sand compressed but not displaced
- Typical divot size: 2-6 inches in diameter, 1-2 inches deep

**Repair Procedure**
1. Locate all divots in bunker
2. Loosen compacted sand using divot tool or small rake
3. Fill divot with fresh sand using bucket
4. Pack sand firmly (not pounded)
5. Rake to blend with surrounding surface
6. Verify repaired divot level with bunker floor

**Sand Replacement Program**
- Replace bunker sand every 2-3 years if not sooner
- Signs replacement needed: Sand becomes dark, compacted, mixed with soil/silt
- Full replacement: All sand removed and replaced with new (#20 concrete sand or similar)
- Cost: $2,000-3,000 per bunker replacement cycle

### Bunker Edging

**Daily Edge Maintenance**
1. Inspect edges for grass overgrowth or erosion
2. Trim overhanging grass with string trimmer
3. Remove grass clippings from bunker edge
4. Rake edge to sharp, clean appearance
5. Check for exposed soil (should be covered with sand)

**Weekly Deep Edge Work**
1. Use spade to cut back edge if grass advancing
2. Establish clean bunker/grass interface
3. Remove sod if necessary to define edge
4. Ensure edge is not too steep (stability concern)
5. Top-dress edge with sand to blend

**Erosion Repair**
1. Identify eroded or slumping areas
2. Remove loose sand and underlying soil
3. Re-compact edge structure
4. Add new sand to restore edge appearance
5. Firm sand by walking or light tamping

### Bunker Surface Preparation

**Sand Depth Standards**
- Bunker bottom: Minimum 3 inches, maximum 5 inches
- Bunker sides: Taper from 3 inches at bottom to 0-1 inch at top
- Measurement: Use depth gauge at 5 points per bunker

**Surface Firmness**
1. Bunker floor should be moderately firm (playable, not rock-hard)
2. Test by stepping firmly; foot should not sink more than 1/4 inch
3. If too soft: Rake frequently, compact by foot traffic
4. If too hard: Add thin layer of fresh sand, water lightly, re-rake

**Slope and Drainage**
1. Bunker should have slight slope toward drainage
2. No standing water after rainfall
3. If water collects: Check drainage system
4. Poor drainage may require bunker renovation

### Debris Removal

**Daily Inspection**
1. Walk each bunker looking for debris
2. Remove leaves, grass clippings, rocks, branches
3. Use hand rake or hand collection
4. Don't leave foreign material in bunker

**Seasonal Debris Management**
- Fall: Frequent removal of fallen leaves
- Winter: Snow removal as needed
- Spring: Clear winter debris accumulation
- Summer: Minimal debris typically

### Equipment Management

**Equipment Maintenance**
1. Rinse bunker rakes after each use
2. Dry equipment before storage
3. Inspect for bent tines or damage
4. Replace damaged rakes immediately
5. Maintain minimum 2 rakes always available

**Sand Pile Management**
1. Maintain sand stockpile at convenient location
2. Replace sand as consumed in divot repairs
3. Keep sand covered to prevent contamination
4. Maintain inventory log of sand usage
5. Order new sand supply when stockpile depletes to 25%

### Problem Areas and Solutions

**Compacted Bunkers**
- Issue: Sand becomes hard and crusty
- Solution: Rake more frequently (twice daily if severe)
- Add fresh sand layer to restore softness
- Check for excess traffic or inadequate sand depth

**Slumping Edges**
- Issue: Bunker edge collapsing or eroding
- Solution: Rebuild edge with proper slope (not too steep)
- May require sod installation to stabilize
- Consider bunker renovation if severe

**Water Retention**
- Issue: Water standing in bunker
- Solution: Check drainage system functioning
- Ensure adequate slope toward drain
- Consider adding sand to raise level if in low spot

**Sand Migration**
- Issue: Sand washing out during heavy rain
- Solution: Check bunker construction and edge integrity
- May need bunker renovation with better drainage
- Temporary: Add more sand after heavy rain

## Safety Requirements
- Bunker raking performed only during daylight hours
- Clear bunker of golfers before maintenance
- Use proper ergonomic technique when raking (avoid strain)
- Inspect rakes for sharp edges or damage

## Quality Standards
- All bunkers raked and smooth by 0700 hours daily
- No visible footprints or ball marks after raking
- Sand depth maintained 3-5 inches
- Edges clean and well-defined
- Bunker playable and safe

## Documentation
- Maintain Daily Bunker Maintenance Log
- Record raking completion time
- Note any bunkers requiring special attention
- Document sand usage and stockpile levels
- File bunker renovation schedules (2-3 year cycle)
$$,
  'bunkers',
  'sop',
  ARRAY['bunkers', 'daily-maintenance', 'quality-control'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Bunker Renovation Procedure',
  $$# Bunker Renovation Procedure

## Purpose
To completely renovate deteriorated bunkers, restoring structural integrity, proper drainage, and playing characteristics.

## Scope
Selective bunker renovation at Veterans Memorial GC (2-3 bunkers per year on rotation).

## Responsibilities
- Superintendent: Bunker assessment and renovation scheduling
- Golf Contractor: Heavy equipment operation and execution
- In-House Crew: Preparation and finishing work

## Procedure

### Pre-Renovation Assessment

**Bunker Evaluation Criteria**
1. Inspect bunker structure and edge integrity
2. Assess sand quality and contamination level
3. Check drainage functionality
4. Evaluate edge erosion or slumping
5. Document playability issues
6. Photograph bunker condition

**Decision Criteria (Renovate if)**
- Sand mixed with silt/soil more than 20%
- Drainage not functioning (standing water after rain)
- Edge erosion severe (greater than 6 inches)
- More than 3-4 repairs required annually
- Sand compacted and unplayable
- Professional assessment recommends renovation

### Pre-Renovation Preparation

**Site Preparation**
1. Notify golf operations of renovation schedule (2 weeks notice)
2. Mark bunker area with warning signs
3. Arrange equipment storage area near bunker
4. Prepare access path for equipment
5. Stock materials: Sand, edging materials, seed/sod

**Material Procurement**
1. Sand: #20 concrete sand (same source for consistency)
   - Quantity: 15-25 cubic yards per bunker (depends on size)
   - Cost: $150-200 per cubic yard delivered
   - Quality: Tested for proper particle size
2. Edging materials:
   - Landscape edging if plastic borders used
   - Sod if edge needs stabilization
   - Drainage pipe if subsurface drainage needed

**Equipment Rental**
1. Excavator (small, 1.5-ton class)
2. Dump truck for sand delivery
3. Mini-roller for compaction
4. Hand tools for finishing

### Renovation Procedure

**Day 1: Sand and Soil Removal**
1. Excavate existing sand from bunker
2. Remove top 2-3 inches of soil to expose subgrade
3. Remove contaminated sand/soil mixture
4. Document depth and condition of existing material
5. Place all material in dump truck for disposal

**Subgrade Preparation**
1. Inspect subgrade for stability
2. Break up compacted areas if needed
3. Create slight slope for drainage (1-2% grade)
4. Install drainage system if required:
   - Perforated drain pipe around bunker perimeter
   - Pipe leads to course drainage system
   - Grave/stone base layer (2-3 inches)
5. Compact subgrade with mini-roller

**Layer 2: Drainage Layer**
1. Add 2-3 inches of coarse gravel (0.5-1 inch stone)
2. Spread evenly across bunker bottom
3. Compact gently with roller
4. Ensure drainage toward outlet

**Layer 3: Sand Installation**
1. Deliver fresh sand via dump truck
2. Spread sand evenly using spreader or manual distribution
3. Target depth: 4-5 inches (firm but playable)
4. Compact lightly with roller to firm surface
5. Verify depth at multiple points

**Day 2: Edge Restoration**
1. Define bunker edge with clean line
2. Install edging (if plastic borders used):
   - Install 1/16-inch plastic edging along entire edge
   - Edging extends 1 inch above grade, 3 inches below
   - Anchor with pins every 12 inches
3. Sod installation (if edge stabilization needed):
   - Install sod along edge to prevent slumping
   - Stagger sod joints
   - Water immediately after installation
4. Create clean bunker/grass interface

**Day 3: Finishing and Testing**
1. Rake bunker to smooth finish
2. Remove equipment from site
3. Test drainage: Run water through bunker
4. Verify water drains within 24 hours
5. Test playability: Confirm sand is acceptable firmness
6. Edge inspection: Clean, sharp lines, no debris

**Day 4: Hardscape and Final Details**
1. Clean bunker completely of equipment and debris
2. Remove signage and restore normal appearance
3. Water sand if dry conditions (settles material)
4. Final rake to finish appearance

### Post-Renovation Management

**First Week (Break-In Period)**
1. Close bunker to play if possible (brief period)
2. Monitor bunker performance
3. Fill any new divots immediately
4. Inspect drainage after first rainfall
5. Note any settling or issues

**First Month**
1. Bunker may settle slightly; add sand if depth decreases
2. Close if water retention occurs (drainage issue)
3. Rake frequently to break in new sand
4. Monitor edge stability (newly installed sod)
5. Document performance for future reference

### Renovation Cost Analysis
- Materials: $2,000-3,000 per bunker
- Labor (contractor): $2,000-4,000 per bunker
- Total cost: $4,000-7,000 per bunker
- Cost allocation: 2-3 year rotation, budget $12,000-21,000 annually

### Maintenance After Renovation
1. Continue daily maintenance per Daily Bunker Maintenance SOP
2. Sand replacement: Every 2-3 years (less frequent than non-renovated)
3. Edge maintenance: As-needed for vegetation growth
4. Drainage inspection: Annually
5. Cost reduction: Renovated bunkers require less frequent full renovation

### Quality Standards for Renovated Bunker
- Sand depth: 4-5 inches uniform
- Drainage functional: Water drains within 24 hours
- Edge stable: No erosion visible
- Playability: Sand firm but not hard
- Appearance: Professional, well-maintained look

## Safety Requirements
- Professional contractor operates heavy equipment
- Site clearly marked and secured during work
- No golf course access during active renovation
- Drainage system properly installed for safety
- Final inspection confirms safe playable conditions

## Quality Standards
- Sand meets specifications (proper gradation)
- Drainage system functional
- Edge structure stable and not slumping
- Bunker playable with proper characteristics
- Professional appearance comparable to championship standards

## Documentation
- Pre-renovation photographs and assessment
- Renovation date and contractor used
- Materials used and costs
- Post-renovation photographs
- Maintenance schedule for renovated bunker
- Long-term tracking for next renovation cycle (2-3 years)
$$,
  'bunkers',
  'sop',
  ARRAY['bunkers', 'renovation', 'construction', 'maintenance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- LANDSCAPING SOPs (20-21)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Tree & Shrub Care Program',
  $$# Tree & Shrub Care Program

## Purpose
To maintain healthy, well-maintained landscape trees and shrubs that enhance course aesthetics while ensuring player safety.

## Scope
All landscape plantings at Veterans Memorial GC including trees, shrubs, and ornamental vegetation.

## Responsibilities
- Landscape Crew: Maintenance execution
- Superintendent: Program oversight and safety approval
- Certified Arborist: Large tree work and pest assessment

## Procedure

### Spring Program (April-May)

**Tree and Shrub Inspection**
1. Walk entire course in spring for full landscape assessment
2. Identify diseased, dead, or declining trees
3. Note broken branches or storm damage from winter
4. Assess pest damage or insect activity
5. Document findings on course map

**Pruning Program**
1. Remove dead branches from all trees (sanitation pruning)
2. Prune low branches that obstruct sight lines on fairways
3. Remove crossing or rubbing branches
4. Thin dense canopies to improve light penetration
5. Shape shrubs for aesthetic appearance
6. Tools: Pruning saws, hand pruners, loppers

**Pruning Standards**
- Make cuts at branch collar (swollen area at base)
- Remove branches less than 2 inches diameter only
- Never leave stubs (flush cuts preferred)
- Remove 25% maximum of crown in single season
- Do not top trees (removal of large branches creates hazard)

**Spring Fertilization**
1. Apply tree fertilizer (20-10-10 NPK) around base
2. Rate: Follow product label (typically 1-2 lbs per inch diameter)
3. Application: Inject into soil or spread on surface
4. Timing: Early spring as trees leaf out
5. Water in thoroughly

**Pest and Disease Management**
1. Scout for common golf course pests:
   - Japanese beetles, scale insects, aphids
   - Leaf spot diseases, anthracnose
   - Cypress canker, blight diseases
2. Treat if population excessive (pest management decision)
3. Use least-toxic methods first (organic preferred)
4. Insecticide applications in evening (minimize bee exposure)
5. Document treatment date and product used

### Summer Program (June-August)

**Watering Program**
1. Trees and shrubs stressed during drought
2. Newly planted trees: Water 1-2 inches weekly
3. Established trees: Water during extended drought (2+ weeks no rain)
4. Mulch trees to retain moisture (2-3 inch depth)
5. Avoid watering foliage (evening watering preferred)

**Inspection and Monitoring**
1. Weekly walk-through of landscape areas
2. Monitor for pest outbreaks (increasing populations)
3. Observe for heat stress (leaf curling, color changes)
4. Check soil moisture around trees
5. Remove dead branches as they appear

**Edging and Cleanup**
1. Edge plant beds monthly to maintain appearance
2. Remove fallen branches and debris from beds
3. Rake out leaves from under trees and shrubs
4. Maintain clear sight lines on course
5. Remove any hazardous dead branches

**Disease Management**
1. Monitor for disease symptoms
2. Remove diseased branches (prune to healthy wood)
3. Disinfect pruning tools between cuts (bleach dip)
4. Apply fungicides if disease widespread (consult arborist)
5. Ensure good air circulation to prevent moisture-related diseases

### Fall Program (September-October)

**Fall Cleanup**
1. Rake fallen leaves from plant beds
2. Remove seed pods or fruits creating mess
3. Final pruning to remove dead wood
4. Clean up fallen branches

**Preparation for Winter**
1. Cease nitrogen fertilization after August 1
2. Apply fall fertilizer with higher potassium (lower N)
3. Water thoroughly before ground freezes
4. Mulch tender plants if in exposed location
5. Support tall, weak shrubs with stakes if snow expected

**Pest Management**
1. Check for overwintering pests in bark
2. Remove tent caterpillar egg clusters if visible
3. Apply dormant oil spray if severe pest pressure
4. Timing: Late fall, after leaves drop, before hard freeze

### Winter Program (November-March)

**Winter Pruning Window**
- Ideal time for major pruning (dormancy)
- Trees heal better when dormant
- Fewer disease-spreading opportunities
- Deciduous trees can be pruned November-February

**Winter Pruning Procedure**
1. Remove dead wood (obvious hazard)
2. Remove rubbing or crossing branches
3. Remove double leaders on young trees
4. Establish strong branch structure
5. Do not prune evergreens (dormant damage risk)

**Snow and Ice Management**
1. Remove heavy snow from evergreens if branches loading
2. Gently brush accumulation (not shake vigorously)
3. Remove broken branches immediately
4. Document storm damage for spring clean-up
5. Prune damaged trees in spring (not immediately if cold)

**Mulch Management**
1. Maintain 2-3 inch mulch around trees
2. Refresh mulch in spring if depleted
3. Keep mulch 3 inches from tree trunk (disease prevention)
4. Use organic mulch (wood chips, bark, not dyed)

### Tree and Shrub Planting Program

**New Planting Specifications**
1. Select species appropriate for military installation setting
2. Choose shade, flowering, or ornamental trees per design
3. Spacing: Plant to mature size (avoid overcrowding)
4. Planting hole: 1.5× root ball diameter, same depth
5. Backfill with native soil amended with compost (25% compost)
6. Water thoroughly after planting

**Post-Planting Care (First Year)**
1. Water 1-2 inches weekly (more in heat)
2. Mulch to 3-inch depth, 3 inches from trunk
3. Stake if necessary for wind support
4. Remove stakes after one year
5. Minimal pruning first year (let tree establish)

**Cost Budgeting**
- Tree species selection: $50-200 per tree
- Planting labor: $50-150 per tree
- Annual maintenance cost per tree: $10-30 (routine care)
- Major pruning (every 3-5 years): $100-500 per tree

### Large Tree Work Specifications

**Requirement for Contractor**
- Any tree work requiring climbing equipment
- Removal of large branches (over 4 inches diameter)
- Removal of entire trees
- Work at heights above 20 feet
- Hazard tree removal

**Contractor Selection**
1. Verify certified arborist credentials (ISA certification preferred)
2. Verify liability insurance (minimum $1M)
3. Reference check with previous clients
4. Written estimate including scope and cost
5. Timeline for completion

### Hazard Tree Assessment

**Annual Assessment**
1. Inspect all large trees for structural defects
2. Look for signs of disease, insect damage, decline
3. Assess proximity to buildings, greens, fairways
4. Document trees requiring attention
5. Prioritize removal or treatment decisions

**Removal Decision Criteria**
- Dead or dying tree
- Structural defects creating safety hazard
- Disease (e.g., Dutch elm disease) spreading risk
- Interfering with course maintenance or play
- Growing into structures

**Removal Procedure**
1. Contract with certified arborist for removal
2. Schedule during off-season if possible
3. Stump grinding included in contract
4. Plan for replacement tree planting if desired
5. Document removal with photos

## Safety Requirements
- Only certified arborists perform large tree work
- Pruning equipment sharp and well-maintained
- Hard hat and eye protection required when cutting
- Clear area below work zone before starting
- Remove hazard trees promptly

## Quality Standards
- Trees healthy and free of obvious disease
- Sight lines maintained (no encroaching branches)
- Aesthetic appearance consistent with maintenance standards
- No dead branches or limbs visible
- Plant beds edged and mulched appropriately

## Documentation
- Maintain tree inventory with species and location
- Document all pruning work and dates
- Track pest and disease management treatments
- Record planting and removal dates
- Budget tracking for landscape maintenance costs
$$,
  'landscaping',
  'sop',
  ARRAY['landscaping', 'trees', 'shrubs', 'maintenance', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Flower Bed & Annual Planting',
  $$# Flower Bed & Annual Planting Program

## Purpose
To maintain attractive flower beds and seasonal plantings that enhance course aesthetics and create memorable first impressions.

## Scope
All flower beds, planters, and annual plantings at Veterans Memorial GC entrances, clubhouse, and landscape features.

## Responsibilities
- Landscape Crew: Planting and maintenance execution
- Superintendent: Design approval and budget management
- Horticulturist: Plant selection and care guidance

## Procedure

### Spring Planting Program (April-May)

**Bed Preparation**
1. Remove winter mulch and dead material from beds
2. Loosen soil to 8-inch depth
3. Remove weeds and debris
4. Amend soil with 2 inches compost mixed into top 6 inches
5. Grade beds for proper drainage (slight crown or slope)
6. Establish 2-3 inch mulch layer

**Annual Selection**
1. Select seasonal annuals appropriate for military course:
   - Spring: Pansies, primrose, snapdragons (April-May)
   - Summer: Impatiens, marigolds, petunias, begonias (June-August)
   - Fall: Mums, asters, ornamental kale (September-October)
2. Coordinate color scheme with course branding/theme
3. Select cultivars for disease resistance and heat tolerance
4. Plan for succession planting (stagger plantings for continuous color)

**Planting Specifications**
1. Space plants per label (typically 12-18 inches for most annuals)
2. Dig hole slightly larger than root ball
3. Plant at same depth as growing container (not deeper)
4. Water immediately after planting
5. Mulch around plants (2 inch depth, 3 inches from stems)
6. Mark plantings with species tags for reference

**Watering Program - Spring**
1. Water daily for first 2 weeks after planting
2. Soil should be moist but not waterlogged
3. Water early morning to minimize disease
4. Reduce frequency to 2-3 times weekly as plants establish
5. Monitor for wilting (indicates water need)

### Summer Maintenance Program (June-August)

**Watering Program - Summer**
1. Most annuals need 1-2 inches water weekly
2. Increase frequency during heat (90°F+)
3. Water early morning (6-8am) preferred
4. Deep watering better than frequent shallow
5. Use drip irrigation if available (most efficient)
6. Container plantings: Daily watering may be needed

**Deadheading and Grooming**
1. Pinch off spent flower heads 2-3 times weekly
2. Encourages continued blooming throughout season
3. Removes seeds and extends flowering
4. Also remove yellowing or diseased leaves
5. Maintain compact, full plant shape
6. Clean beds weekly of fallen debris

**Fertilization Program**
1. Apply water-soluble fertilizer every 2-3 weeks
2. Rate: Follow product label (typically 10-10-10 or 5-10-10)
3. Liquid fertilizer applied to soil, not foliage
4. Slow-release fertilizer alternative (incorporated at planting)
5. Reduce fertilization if over-vegetative (too much leaf, few flowers)

**Pest and Disease Management**
1. Scout beds weekly for pest activity
   - Aphids, spider mites, whiteflies common
   - Slugs and snails on tender plants
2. Remove diseased plants promptly
3. Powdery mildew common in humid conditions
4. Use organic controls (neem oil, insecticidal soap) first
5. Chemical pesticide only if population severe

**Mulch Maintenance**
1. Maintain 2-inch mulch depth (refresh if depleted)
2. Keep mulch away from plant stems (air circulation)
3. Renew mulch mid-summer if faded or decomposed
4. Organic mulch decomposes; replenish as needed

### Fall Program (September-October)

**Fall Planting**
1. Select fall annuals (mums, asters, ornamental cabbage)
2. Remove summer annuals as they decline
3. Prepare beds (loosen soil, add compost)
4. Plant fall annuals in September
5. Space and water per specifications above

**Transition Care**
1. Continue deadheading fall plantings
2. Reduce fertilization as season progresses
3. Adjust watering as temperatures cool (less frequent)
4. Remove fallen leaves and debris weekly
5. Monitor for late-season pests

**Winterization**
1. Select tender perennials for indoor protection
2. Dig tender plants (dahlias, tender fuchsia) in October
3. Store in cool location over winter
4. Cut back dead material in November
5. Final cleanup of beds before winter dormancy

### Winter Program (November-March)

**Bed Maintenance**
1. Remove all dead annuals by November
2. Cut back perennials to ground level (if not evergreen)
3. Deep mulch beds to 3-4 inches for winter protection
4. Remove mulch carefully in spring (new growth underneath)
5. Maintain tidiness of empty beds through winter

**Planning for Next Season**
1. Document which plantings succeeded (notes for next year)
2. Record plant performance (disease issues, pest problems)
3. Identify changes needed for next season
4. Order seed catalogs and plan fall plantings
5. Budget for next spring plant purchases

### Container Planting Program

**Container Selection**
1. Use decorative containers (ceramic, resin, wood)
2. Containers for entrances, patios, pathways
3. Drainage holes required (use pot feet for elevation)
4. Size: Minimum 12 inches diameter for most plantings

**Container Soil Mix**
1. Use potting soil (soilless mix) rather than garden soil
2. Quality potting mix with peat moss, perlite, compost
3. Fill container to 1 inch from rim
4. Do not compress soil

**Container Planting**
1. Use 3-5 plants per large container for full appearance
2. Combine thriller, filler, spiller (design principle)
3. Water immediately after planting
4. Place in appropriate light location (sun vs. shade)

**Container Maintenance**
1. Water daily during growing season (containers dry faster)
2. More frequent in heat (twice daily if 90°F+)
3. Fertilize weekly (soil nutrients leached with watering)
4. Deadhead spent flowers regularly
5. Refresh plantings as needed through season

### Budget Planning

**Annual Costs**
- Spring plantings (5,000 sq ft beds): $2,000-3,000
- Summer maintenance (labor, water, fertilizer): $1,500-2,000
- Fall plantings: $1,000-1,500
- Container plantings (20 containers): $800-1,200
- Total annual budget: $5,300-7,700

**Cost-Saving Measures**
1. Propagate perennials from existing plantings
2. Save seed from successful annuals
3. Grow annuals from seed (cheaper than purchasing)
4. Multi-year perennial plantings reduce annual cost
5. Bulk purchase at growing season discount

## Safety Requirements
- Use proper ergonomic techniques when bending/digging
- Wear gloves when handling soil and plants
- Apply pesticides per EPA label with appropriate PPE
- Keep pathways clear of mulch and debris for safety

## Quality Standards
- Beds appear full, healthy, and colorful throughout season
- Plants disease-free and pest-free
- Soil amendment and mulch maintained
- Consistent, attractive appearance
- Blooms and growth appropriate for species

## Documentation
- Document plantings with date, species, location
- Track plant performance and disease issues
- Record pest management treatments
- Maintain cost records for budget tracking
- File plant photos for design reference
$$,
  'landscaping',
  'sop',
  ARRAY['landscaping', 'annuals', 'flower-beds', 'planting', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- SAFETY SOPs (22-25)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Heat Illness Prevention Program',
  $$# Heat Illness Prevention Program

## Purpose
To prevent heat-related illness among personnel working outdoors during high-temperature periods through awareness, hydration, rest, and monitoring.

## Scope
All outdoor personnel at Veterans Memorial GC, particularly those working in direct sun during peak heat hours.

## Responsibilities
- Safety Officer: Program implementation and monitoring
- Supervisor: Daily assessment and crew management
- All Personnel: Following heat safety guidelines

## Procedure

### Heat Illness Recognition

**Heat-Related Illnesses (in order of severity)**

1. **Heat Exhaustion** (most common)
   - Heavy sweating, weakness, dizziness
   - Nausea, headache, muscle cramps
   - Cool, moist skin; normal or elevated temperature
   - Action: Move to shade, drink water, rest 15-30 minutes
   - Usually resolves with rest and hydration

2. **Heat Stroke** (medical emergency)
   - Hot, dry skin (little/no sweating); very high temp (104°F+)
   - Confusion, irritability, loss of consciousness
   - Possible seizures
   - Action: CALL 911 IMMEDIATELY, move to shade, cool with water/ice

### Temperature Thresholds and Work Adjustments

**Heat Index Monitoring**
1. Check National Weather Service heat index daily (typically at 0600 hours)
2. Heat index combines temperature and humidity
3. Use outdoor thermometer at course to verify

**Heat Index Based Actions**

**Heat Index 90-99°F: CAUTION**
- Standard work schedule maintained
- Increase water breaks (every 30 minutes)
- Adjust mowing start time earlier if possible
- Monitor personnel for early heat stress
- Lightweight, light-colored clothing

**Heat Index 100-104°F: EXTREME CAUTION**
- Reduce work hours: Start 0530, finish by 1200
- Afternoon off, evening return (if needed) after 1600
- Water breaks every 20 minutes
- Pair up (buddy system) for observation
- Increased supervisor monitoring

**Heat Index 105°F+: DANGER (May Close Course)**
- Work suspended 1000-1600 hours
- Early morning operations only (0530-0900)
- Evening operations optional (1700-1900)
- Staff reduced to essential personnel only
- Hospitality tents with shade and ice water required
- Course play may be restricted

### Prevention Measures

**Hydration Program**
1. Drink water regularly, don't wait for thirst
2. Minimum: 1 cup (8 oz) water every 20-30 minutes
3. More in high heat: 1 cup every 15-20 minutes
4. Electrolyte drinks acceptable (sports drinks)
5. Avoid caffeine and alcohol before/during work
6. Personal water bottle required for all outdoor personnel
7. Water stations established throughout course
8. Ice water preferred over room temperature

**Clothing and Apparel**
1. Light-colored, lightweight fabric clothing
2. Long sleeves and long pants (sun protection)
3. Wide-brimmed hat or cap mandatory
4. Sunglasses to reduce eye strain
5. Steel-toed boots (required for safety, not negotiable)
6. Minimize metal on body (overheats in sun)

**Schedule Modifications**
1. Start work earlier (0530 hours vs. 0600) to beat heat
2. Finish early on high heat days (1200 vs. 1300)
3. Longest work hours during cooler parts of day
4. Afternoon break 1200-1600 (avoid peak heat)
5. Evening completion of tasks if necessary (after 1600)

**Workload Management**
1. Reduce physical intensity during high heat
2. Alternative tasks during peak heat hours
3. Equipment operation safer than physical labor in heat
4. Rotating personnel between shaded and sun-exposed tasks
5. Supervisor discretion to modify schedule

### Rest and Shade Requirements

**Mandatory Rest Breaks**
1. Every 2 hours: 15-minute rest in shade (minimum)
2. More frequent in extreme heat (every 1.5-2 hours)
3. Rest breaks must include fluid intake
4. Shaded areas available throughout course
5. Equipment operation at rest (not continuous)

**Designated Rest Areas**
1. Equipment shed (shaded, cooled area if possible)
2. Maintenance office (air-conditioned)
3. Under trees/pavilions on course
4. Mobile shade tent (for remote areas)
5. Coolers with ice water positioned strategically

### Personnel Monitoring

**Visual Observation Protocol**
1. Supervisor checks each crew member's condition regularly
2. Look for: Excessive sweating, flushed face, stumbling, confusion
3. Ask specific questions: "Are you okay?", "How do you feel?"
4. Pair inexperienced with experienced personnel (buddy system)
5. Immediate removal from heat if symptoms appear

**Shift Briefing**
1. Morning briefing includes heat index and work adjustments
2. Review symptoms of heat illness with crew
3. Remind personnel to drink water regularly
4. Inform of any schedule changes due to heat
5. Encourage crew to report if they feel unwell

**New Personnel Acclimatization**
1. New hires need 7-14 days to acclimatize to heat
2. First week: Reduced hours, frequent breaks
3. Gradual exposure to full work schedule
4. Partner with experienced personnel
5. Monitor more frequently during acclimatization

### Emergency Response

**Heat Exhaustion Response (Mild)**
1. Stop work immediately
2. Move personnel to shade
3. Have person sit/lie down, elevate legs
4. Give water to drink (not ice-cold)
5. Cool body with water on skin, wet cloth, fan
6. Rest minimum 15-30 minutes
7. Can resume work if fully recovered (supervisor judgment)
8. Document incident

**Heat Stroke Response (SEVERE - CALL 911)**
1. Call 911 immediately (do not delay)
2. Move person to shade while awaiting ambulance
3. Cool aggressively: ice water, ice packs, spray with water
4. Remove excess clothing to allow cooling
5. If unconscious, do not give water
6. Monitor breathing and consciousness
7. Provide information to EMTs upon arrival
8. Document incident completely

**Post-Incident Actions**
1. Personnel with heat exhaustion: Rest remainder of day
2. Return to work next day (unless advised otherwise)
3. Heat stroke: Medical clearance required before returning
4. Review incident in team meeting (learn and prevent recurrence)
5. File incident report with base safety officer

### Training and Education

**Initial Training**
1. All new personnel receive heat illness training
2. Training covers: Recognition, prevention, response
3. Hands-on demonstration of hydration and rest
4. Q&A to ensure understanding
5. Documentation signed

**Annual Refresher**
1. Before summer season (May 1), conduct refresher training
2. Review previous year's incidents
3. Update on any procedure changes
4. Emphasize personal responsibility
5. Certification signed by all personnel

### Documentation and Reporting

**Heat Illness Log**
1. Record all heat exhaustion/stroke incidents
2. Document: Date, time, temperature, person's name
3. Symptoms observed and actions taken
4. Time to recovery, return to work
5. Any medical attention provided
6. Root cause analysis (why did this happen?)

**Trend Analysis**
1. Review heat illness incidents quarterly
2. Identify high-risk times/temperatures
3. Adjust procedures if needed
4. Communicate trends to safety committee
5. Implement additional controls if needed

## Safety Requirements
- Hydration mandatory; cannot be optional
- Heat index monitoring daily during season
- Work schedule adjusted for high heat days
- Supervisor present during all outdoor work
- Emergency response training current for all supervisors

## Quality Standards
- Zero heat-related deaths or hospitalizations (goal)
- Heat exhaustion incidents minimized through prevention
- All personnel trained and aware of heat illness
- Proper response procedures followed if incident occurs
- Documentation complete and filed

## Documentation
- Daily heat index recording
- Heat illness incident log (if any)
- Personnel training records with certification dates
- Trend analysis quarterly
- Changes to procedures documented
$$,
  'safety',
  'sop',
  ARRAY['safety', 'heat-illness', 'health', 'prevention', 'seasonal'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Lightning Safety Protocol',
  $$# Lightning Safety Protocol

## Purpose
To protect personnel and golfers from lightning hazard through early warning, evacuation, and shelter procedures during thunderstorms.

## Scope
All personnel and golfers at Veterans Memorial GC during storm activity.

## Responsibilities
- Safety Officer: Storm monitoring and alert issuance
- Course Operations: Player evacuation and course closure
- Maintenance Crew: Sheltering and safety monitoring

## Procedure

### Lightning Hazard Recognition

**Thunderstorm Development**
1. Dark clouds approaching from any direction
2. Wind increasing and shifting direction
3. Temperature cooling noticeably
4. Barometric pressure dropping
5. Sound of distant thunder

**Lightning Distance Estimation**
- Count seconds between lightning flash and thunder
- Divide by 5 to get miles away (e.g., 25 seconds ÷ 5 = 5 miles away)
- If less than 10 seconds (2 miles): HIGH RISK, evacuate immediately

**Lightning Risk Levels**

**Level 1: 10+ miles away (Green/Safe)**
- Lightning unlikely to reach course
- Normal operations continue
- Monitor conditions

**Level 2: 5-10 miles away (Yellow/Caution)**
- Lightning possible but not imminent
- Prepare for potential evacuation
- Cease outdoor operations
- Move equipment and personnel toward shelter

**Level 3: Less than 5 miles away (Red/Danger)**
- Imminent lightning risk
- Course CLOSED immediately
- All personnel must be in safe shelter
- No exceptions; immediate evacuation mandatory

### Storm Monitoring Procedures

**Responsibility Assignment**
1. Safety Officer monitors weather continuously during season
2. Check National Weather Service radar throughout day
3. Monitor local weather for storm development
4. Listen for thunder; use lightning distance calculation
5. National Weather Service alerts for county

**Early Warning System**
1. Weather alert service subscription (NOAA alerts)
2. Lightning detection system (if available)
3. Visual/sound observation of storm approach
4. Radio communication with golf shop for player alerts

### Evacuation Procedures

**Immediate Evacuation (Level 3: <5 miles)**

**Golf Shop/Starter Operations**
1. Sound evacuation signal (air horn or alarm)
2. Announce clearly: "LIGHTNING EVACUATION - RETURN TO CLUBHOUSE"
3. Stop all player check-ins
4. Direct arriving golfers to shelter immediately

**On-Course Evacuation**
1. Players must abandon play immediately
2. Leave golf carts where they are (do not return to cart path)
3. Walk directly to nearest shelter
4. Do not wait for group ahead or behind
5. Move off fairways and rough to cover

**Shelter Locations**
1. Clubhouse (primary shelter - most safe)
2. Maintenance building (adequate shelter)
3. Vehicle interiors (if doors closed; avoid touching metal)
4. Properly constructed building with electrical grounding
5. DO NOT use: Golf carts, pavilions, under trees, open areas

**Maintenance Operations Evacuation**
1. All outdoor work stops immediately
2. Crews return to maintenance building
3. Equipment left where operation stops (safety first)
4. Supervisor ensures all crew members accounted for
5. Wait in building until all-clear given

### Safe Shelter Identification

**Safe Shelters (Buildings)**
1. Clubhouse - primary shelter
2. Maintenance building - approved shelter
3. Indoor bathrooms/restrooms
4. Pro shop building (if available)
5. Any substantially enclosed building with electrical grounding

**Adequate Shelters (Vehicles)**
1. Vehicle interior with all doors closed
2. Metal-frame vehicles provide good protection
3. Golf carts NOT adequate (open sides, no protection)
4. Keep hands and body away from metal surfaces inside vehicle

**Inadequate Shelters (DO NOT USE)**
1. Golf carts (open sides, no real protection)
2. Trees (lightning often strikes tall trees)
3. Small open shelters/pavilions (not protection)
4. Underneath utility lines
5. Open fairways or roughs (completely exposed)

### Duration of Shelter

**Stay Sheltered Until**
1. 30 minutes after last lightning observed
2. 30 minutes after last thunder heard
3. Storm has moved away (no more cloud activity)
4. Weather radar shows clear conditions
5. National Weather Service all-clear issued

**Do Not Return to Course Early**
1. Lightning can strike from distant storms
2. Even if rain stopped, lightning risk persists
3. 30-minute rule is industry standard
4. Err on side of caution; safety first

### Communication During Evacuation

**Radio Communication**
1. Use golf shop/maintenance radio for coordination
2. Confirm all personnel sheltered
3. Keep radio on during entire evacuation
4. Do not use cell phones outside during lightning (attract lightning)
5. Wait in shelter until all-clear broadcast

**Player Notification**
1. Announce evacuation clearly and calmly
2. Direct to nearest shelter
3. Do not panic; walk, don't run to shelter
4. Reassure that shelter is safe
5. Provide updates on storm status

### All-Clear Procedures

**Clearing for Return to Play**
1. Safety Officer determines all-clear conditions met
2. Announce: "ALL CLEAR - RESUME OPERATIONS"
3. Allow sufficient time for shelter clearing
4. Operations resume gradually (no rush)
5. Document time of all-clear

**Post-Storm Inspection**
1. Walk course for any lightning damage
2. Check for damaged trees or branches (hazards)
3. Verify irrigation and electrical systems safe
4. Report any damage to supervisor
5. Note any near-miss incidents for discussion

### Special Situations

**Lightning Strikes Observed**
1. If lightning strikes near course:
   - Immediately clear all personnel from that area
   - Keep extended shelter period (avoid that zone)
   - Inspect area for damage
   - Do not allow near-strike areas until clear

**Severe Storms Multiple Times Per Day**
1. Multiple evacuations necessary
2. Continue normal evacuation procedures for each storm
3. Maintain 30-minute shelter period each time
4. Do not shorten shelter period due to multiple storms
5. Course closure may be necessary if excessive interruption

**Night Storms During Maintenance**
1. Night operations close at first lightning sign
2. Crews return to building immediately
3. No outdoor work during night thunderstorms
4. Wait in building; shift extended or restarted later if needed
5. Safety takes priority over schedule

### Training and Awareness

**Personnel Training**
1. All personnel receive lightning safety training annually
2. Before season starts (April 1): Mandatory refresher
3. Training covers: Hazard recognition, evacuation, shelter
4. Hands-on shelter practice during drills
5. Certification documented

**Annual Lightning Drill**
1. Conduct mock evacuation during spring training
2. Test alert system and radios
3. Practice evacuation procedures
4. Verify all shelter locations accessible
5. Document drill completion

**New Employee Training**
1. Lightning safety included in new hire orientation
2. Review safe/unsafe shelter locations
3. Explain evacuation signal and response
4. Practice evacuation route
5. Certification signed

### Documentation and Reporting

**Evacuation Log**
1. Record all evacuations (date, time, duration)
2. Note number of personnel evacuated
3. Any incidents or issues during evacuation
4. Weather conditions and radar observations
5. All-clear time and return to operations

**Lightning Strike Incidents**
1. If lightning strikes course/building:
   - Document location and damage
   - Photograph damage
   - Report to base safety officer
   - File incident report
   - Investigate cause (near-miss prevention)

## Safety Requirements
- Mandatory immediate evacuation at 5-mile lightning distance
- 30-minute shelter period after last lightning/thunder
- Regular training and certification for all personnel
- Lightning detection system or radar monitoring
- Clear communication system for alerts and all-clear

## Quality Standards
- Zero lightning injuries (goal)
- All evacuations executed promptly
- Personnel understand and follow procedures
- Shelter locations safe and accessible
- Documentation complete and filed

## Documentation
- Maintain evacuation log for each incident
- Document all lightning strike incidents
- Keep training records current
- File incident reports with base safety
- Annual trend review for improvements
$$,
  'safety',
  'sop',
  ARRAY['safety', 'lightning', 'storm', 'emergency', 'evacuation'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Personal Protective Equipment (PPE) Requirements',
  $$# Personal Protective Equipment (PPE) Requirements

## Purpose
To establish minimum PPE standards for golf course maintenance personnel based on assigned tasks and hazard assessment.

## Scope
All personnel performing maintenance duties at Veterans Memorial GC.

## Responsibilities
- Safety Officer: PPE program administration
- Supervisors: PPE compliance enforcement
- All Personnel: PPE wear and maintenance

## Procedure

### PPE Selection Based on Task

**Mowing Operations**
Required PPE:
- Steel-toed safety boots (ASTM F-75 rated, minimum)
- Long pants (not shorts)
- High-visibility vest (reflective)
- Hard hat with face shield (or safety glasses minimum)
- Hearing protection (earplugs or muffs, 85+ dB equipment)
- Gloves (optional, depending on equipment)

Duration: Entire mowing operation
Exceptions: None; all equipment requires full PPE

**Equipment Maintenance**
Required PPE:
- Safety glasses or face shield (fluid splash risk)
- Steel-toed boots
- Work gloves (oil/fuel resistant)
- Long sleeves (sun protection, minor hazard protection)
- Hearing protection (if power tools used)

Duration: During all maintenance activities
Special considerations: Respirator if working with sealed systems/fumes

**Chemical Application**
Required PPE:
- Chemical-resistant gloves (nitrile minimum, neoprene preferred)
- Safety glasses or face shield
- Long pants and long sleeves
- Steel-toed boots
- Respirator (per product label, typically P100 cartridge)
- Hat/cap (prevents overspray on head)
- Apron or chemical-resistant coveralls (if available)

Duration: Full application and cleanup
Frequency: Only certified applicators

**Turf Care (Walking/Light Work)**
Required PPE:
- Steel-toed boots
- Long pants
- High-visibility vest (if working near golf carts/traffic)
- Hat or cap (sun protection)
- Sunglasses (optional, UV protection recommended)
- Gloves (optional, depending on task)

Duration: All outdoor work
Season: Year-round (modified for winter)

**Irrigation Work**
Required PPE:
- Steel-toed boots
- Long pants
- Safety glasses (if pressurized system work)
- Gloves (water-resistant)
- Hat/cap (sun protection)
- High-visibility vest (if near traffic)

Duration: During all irrigation operations
Special considerations: Hearing protection if drilling/cutting

### PPE Standards and Specifications

**Steel-Toed Boots**
- ANSI Z41 or ASTM F-75 certified
- Minimum 6-inch height (ankle protection)
- Oil/fuel resistant sole for chemical protection
- Good tread for slip resistance
- Cost: $80-150 per pair
- Replacement: When worn or damaged, minimum 2 pairs per employee
- Inspection: Daily visual check for damage

**Safety Glasses/Face Shield**
- ANSI Z87.1 certified
- Impact-resistant plastic lenses
- Side protection (no exposed eyes)
- Anti-glare/UV coating recommended
- For chemical work: Full face shield preferred
- Inspection: Replace if scratched, cracked, or loose
- Cleaning: Daily cleaning with appropriate cloth

**Hearing Protection**
- Earplugs or earmuffs (ANSI S3.19 rated)
- NRR (Noise Reduction Rating) minimum 20dB
- Equipment over 85dB requires hearing protection
- Proper fit essential for effectiveness
- Inspection: Earplugs replaced monthly, muffs checked for wear
- Training: Demonstrate proper insertion of earplugs

**Hard Hat**
- ANSI Z89.1 certified, Class C minimum
- Helmet-style for maximum protection
- Impact-resistant plastic
- Adjustment band for proper fit
- Replacement: Every 5 years or after significant impact
- Inspection: Check for cracks or deterioration

**High-Visibility Vest**
- ANSI 107 Class 2 minimum (2-inch reflective stripes)
- Fluorescent colors (yellow, orange)
- Proper fit for movement
- Clean/visible condition
- Replacement: When faded or reflective worn off

**Chemical Protective Gloves**
- Nitrile: Minimum 5 mil thickness (latex if not available)
- Neoprene: Preferred for extended chemical contact
- Full arm coverage if chemical splash risk
- Inspection: Check for tears or holes before use
- Replacement: After chemical exposure (wash with soap and water first)

**Respiratory Protection**
- Only used by certified applicators
- NIOSH-certified cartridge respirator minimum
- P100 or organic vapor cartridge based on chemical
- Proper fit-testing required (annual)
- Inspection: Check seals and cartridge condition
- Replacement: Cartridges per manufacturer specifications

### PPE Issue and Maintenance Program

**Employee PPE Issuance**
1. New employee receives initial PPE kit:
   - 2 pairs steel-toed boots
   - 2 pairs safety glasses
   - 2 pairs hearing protection devices
   - 1 hard hat
   - 1 high-visibility vest
   - Work gloves as needed
2. Document issuance with employee signature
3. Supervisor explains use and care

**Replacement and Maintenance**
1. Damaged PPE replaced immediately (don't wait for scheduled replacement)
2. Annual replacement of worn items (April 1)
3. Employees responsible for proper care and storage
4. Lost or severely damaged items: Employee pays replacement cost (first occurrence warning, subsequent discipline per policy)
5. Supervisor inspects PPE monthly for condition

**Cleaning and Storage**
1. PPE cleaned after each use
2. Glasses/shields: Wash with soap and water, dry with cloth
3. Boots: Wipe clean daily, deep clean weekly
4. Vests: Wash weekly (maintain reflectivity)
5. Store in lockers/cubicles when not in use
6. Do not leave in vehicles (heat degradation)

### PPE Compliance and Enforcement

**Supervisor Responsibilities**
1. Inspect crew PPE daily before work begins
2. Enforce proper wear of all required PPE
3. Do not allow work without proper PPE
4. Document non-compliance incidents
5. Provide remedial training for repeated violations

**Compliance Standards**
1. 100% PPE compliance expected
2. No exceptions; no shortcuts
3. Safety culture of "everyone goes home safe"
4. Progressive discipline for non-compliance:
   - First violation: Verbal warning, education
   - Second violation: Written warning
   - Third violation: Suspension or termination per policy

**Incident Investigation**
1. If injury occurs: Review PPE use at time of incident
2. Determine if PPE failure or non-use contributed
3. Implement corrective actions to prevent recurrence
4. Update PPE requirements if needed

### Heat and Cold Modifications

**Summer Heat Management**
1. Light-colored, moisture-wicking clothing recommended
2. Long sleeves for sun protection (not negotiable)
3. Sunscreen (SPF 30+) for exposed skin
4. Increase hydration when wearing full PPE
5. Schedule heavy work during cooler parts of day

**Winter/Cold Weather**
1. Thermal underwear under regular PPE
2. Insulated boots acceptable if safety-rated
3. Heavy gloves acceptable (maintain dexterity)
4. Insulated vest over high-visibility vest
5. Ensure visibility maintained (reflective colors not covered)

### Special Equipment Protection

**Respiratory Protection Program**
1. Only certified applicators use respirators
2. Medical evaluation required before first use
3. Annual fit-testing (OSHA requirement)
4. Proper cartridge selection per chemical hazard
5. Cartridge replacement per OSHA guidance (typically 40-hour use)
6. Training: Proper donning/doffing, fit-checking

**Hazmat Suits**
1. For major chemical spill response
2. One-piece, full-body coverage
3. Stored at chemical facility
4. Training required before use
5. Proper decontamination procedures after use

### Training and Certification

**Initial Training**
1. All new employees receive PPE training
2. Training covers: Selection, use, care, maintenance
3. Hands-on demonstration of proper fit and adjustment
4. Employee demonstrates understanding
5. Certification signed and filed

**Annual Refresher Training**
1. April 1: Annual PPE training for all employees
2. Review any policy changes
3. Inspection and replacement discussion
4. Q&A and questions answered
5. Certification updated

**Inspection and Audit**
1. Monthly supervisor inspection of crew PPE
2. Quarterly audit of PPE inventory and condition
3. Annual Safety Officer review of program
4. Document all inspections
5. Identify improvement opportunities

### Documentation and Records

**PPE Inventory Log**
1. Track PPE issued to each employee
2. Record replacement items and dates
3. Monitor usage trends (which items wear fastest)
4. Plan budget based on usage patterns

**Compliance Records**
1. Document training and certifications
2. Record fit-testing dates (respiratory protection)
3. Note non-compliance incidents and actions taken
4. Maintain incident reports related to PPE
5. Store records per military requirements

## Safety Requirements
- 100% PPE compliance mandatory
- Proper fit and function verified before use
- Replacement upon any damage or wear
- Training required for all personnel
- Enforcement of standards by supervisors

## Quality Standards
- All PPE ANSI-certified and current
- Proper condition maintained
- Inventory adequate for all personnel
- Training documentation complete
- Compliance audit results satisfactory

## Documentation
- Maintain PPE issuance log for all employees
- Keep training certificates current
- File fit-testing records (respiratory protection)
- Document compliance audits monthly
- Track replacement costs for budget planning
$$,
  'safety',
  'sop',
  ARRAY['safety', 'ppe', 'hazard-protection', 'compliance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Hazard Communication (HazCom) Program',
  $$# Hazard Communication (HazCom) Program

## Purpose
To ensure all personnel understand hazards of chemicals used at Veterans Memorial GC and know how to work safely with them per OSHA HazCom standards.

## Scope
All chemical products (pesticides, fertilizers, herbicides, fuels) stored and used at the golf course.

## Responsibilities
- Safety Officer: HazCom program administration
- Chemical Supervisor: MSDS management and training
- All Personnel: Following safety guidelines

## Procedure

### HazCom Regulatory Framework

**OSHA Requirements**
1. All chemicals must have Safety Data Sheets (SDS) - formerly MSDS
2. Chemicals must be labeled with hazard information
3. All personnel must be trained before handling chemicals
4. Training must cover: Hazards, safe use, emergency response
5. Records must be maintained per federal requirements

**GHS (Global Harmonized System)**
1. Hazard Classification: Physical, health, environmental
2. Label Elements: Signal words (Warning, Danger), pictograms, hazard statements
3. SDS Format: Standardized 16-section format
4. Consistency: Same classification globally

### Safety Data Sheet (SDS) Management

**SDS Procurement**
1. Request SDS from supplier with each chemical shipment
2. Verify SDS date is current (within 5 years)
3. File SDS in central location (also copy at chemical facility)
4. Update SDS when new version provided
5. Discard old SDS when updated version received

**SDS Organization**
1. Organize by chemical name in 3-ring binder
2. Index by product name and active ingredient
3. Alternative: Organize by use type (pesticides, fertilizers, etc.)
4. Include Table of Contents with page numbers
5. Maintain duplicate copy at chemical storage facility

**SDS Content Review**
- Section 1: Identification (chemical name, manufacturer)
- Section 2: Hazard Identification (physical and health hazards)
- Section 3: Composition/Information on Ingredients
- Section 4: First-Aid Measures
- Section 5: Fire-Fighting Measures
- Section 6: Accidental Release Measures
- Section 7: Handling and Storage
- Section 8: Exposure Controls and Personal Protective Equipment
- Sections 9-16: Physical properties, stability, disposal, regulatory info

**Availability**
1. Main SDS binder in office (accessible to all)
2. Copy at chemical storage facility
3. Digital copy on computer (backup)
4. Posted in multiple locations where chemicals used
5. Accessible during work hours and emergencies

### Chemical Labeling

**Label Information Required**
1. Product name (chemical name and common name)
2. Manufacturer name and contact information
3. Hazard warnings (signal word: WARNING or DANGER)
4. Hazard pictograms (warning symbols)
5. Hazard statements (what the hazard is)
6. Precautionary statements (how to prevent exposure)
7. First-aid instructions (if exposed or ingested)

**Label Inspection Program**
1. Upon receipt: Check label is present and legible
2. During storage: Monthly inspection (labels should remain legible)
3. Replace label if worn, faded, or illegible
4. Do not remove label or cover with tape
5. Use original container only (never transfer without label)

**Missing or Damaged Labels**
1. Chemical with damaged label: Move to quarantine area
2. Contact supplier for replacement label or SDS
3. Do not use chemical with illegible label
4. Discard or return to supplier if replacement unavailable

### Personnel Training

**Initial Training (New Employee)**
1. HazCom training before first chemical exposure
2. Training covers:
   - Basic hazard recognition
   - Reading SDS (critical sections)
   - Label interpretation
   - PPE requirements per SDS
   - Emergency response (first aid, spill response)
   - Reporting procedures
3. Hands-on demonstration of SDS sections
4. Employee signs training certification

**Task-Specific Training**
1. Before using pesticide: Review SDS and label
2. New applicator: Additional training on application procedures
3. New chemical introduction: Training before first use
4. Supervisor conducts task-specific training

**Annual Refresher**
1. April 1: All-employee HazCom refresher training
2. Review any new chemicals added to inventory
3. Update on any regulatory changes
4. Reinforce safe handling practices
5. Question and answer session
6. Certification renewed

**Training Documentation**
1. Record training date and attendees
2. Document topics covered
3. Note any questions or concerns raised
4. SDS reviewed (list which products)
5. Employee signature confirming training

### Hazard Identification and Communication

**Physical Hazards**
- Flammable (liquid, gas, solid)
- Oxidizing chemicals
- Pressure-release hazard
- Reactivity hazard
- Corrosive materials

**Health Hazards**
- Acute toxicity (poisoning from single exposure)
- Chronic toxicity (illness from repeated exposure)
- Respiratory irritant
- Skin irritant or sensitizer
- Eye irritant
- Carcinogen/reproductive hazard

**Environmental Hazards**
- Aquatic toxicity (kills fish/aquatic life)
- Soil contamination potential
- Ozone depletion risk

**Hazard Communication Method**
1. Labels on all containers
2. SDS available for all chemicals
3. Employee training on hazards
4. Warning posters at chemical facility
5. Supervisor communication and reminders

### Safe Handling Practices

**General Chemical Safety**
1. Read SDS before using any chemical
2. Wear required PPE per SDS recommendations
3. Never eat, drink, or smoke while handling chemicals
4. Avoid skin contact; wash hands immediately if exposed
5. Avoid inhalation; use in ventilated area
6. Follow application rate and frequency; never exceed
7. Do not mix chemicals unless SDS permits
8. Keep containers closed when not in use

**Storage and Transport**
1. Store chemicals in designated area
2. Organize by compatibility (incompatible chemicals separate)
3. Keep in original labeled containers
4. Do not store in food/drink areas
5. Transport in locked vehicle
6. Keep containers upright
7. Secondary containment prevents spills

**Spill Response**
1. Immediately stop operation
2. Alert other personnel in area
3. Check SDS for spill response procedures
4. Small spill (less than 1 quart): Use absorbent material
5. Large spill: Contact hazmat/environmental authority
6. Contain spill to prevent water/soil contamination
7. Dispose of properly per SDS guidance

### Emergency Response Information

**First Aid Procedures (per SDS)**
1. Skin contact: Wash with soap and water, remove contaminated clothing
2. Eye contact: Rinse with water for 15 minutes
3. Inhalation: Move to fresh air, seek medical attention if respiratory symptoms
4. Ingestion: Contact poison control, do not induce vomiting

**Poison Control**
- National Poison Control: 1-800-222-1222 (available 24/7)
- Information needed: Product name, active ingredient, amount exposed
- Medical facility: Great Lakes Naval Base hospital

**Emergency Services**
1. Severe reaction: Call 911 immediately
2. Provide first aid while awaiting ambulance
3. Have SDS available for emergency responders
4. Inform responders of chemical exposure

### Record Keeping and Compliance

**Training Records**
1. Employee name and training date
2. Trainer name
3. Topics covered (list chemicals if applicable)
4. Employee signature or initials
5. Retain records for 30 years (OSHA requirement)

**Incident Records**
1. If exposure occurs: Complete incident report
2. Document: Date, chemical, exposure type, amount
3. First aid provided and response
4. Any follow-up medical attention
5. Corrective actions to prevent recurrence

**Audit and Inspection**
1. Quarterly review of HazCom compliance
2. Check SDS availability and currency
3. Verify label presence and legibility
4. Confirm training documentation complete
5. Identify improvement opportunities

### Contractor and Visitor Communication

**Outside Contractors**
1. Provide SDS for any chemicals contractors will encounter
2. Inform of hazardous areas on course
3. Require contractors to provide SDS for their chemicals
4. Ensure contractors follow HazCom standards

**Visitors and Participants**
1. Maintain hazard communication signs at chemical storage
2. Restrict access to chemical areas
3. No tours of chemical facilities without authorization
4. Emergency procedures posted visibly

## Safety Requirements
- All chemicals have current SDS on file
- All containers labeled with hazard information
- All personnel trained before chemical exposure
- 30 minutes of hazmat response training per year
- Incident investigation and correction

## Quality Standards
- 100% SDS availability (no chemicals without SDS)
- All labels present and legible
- Training documentation complete and current
- Personnel demonstrate hazard knowledge
- Spill response capability tested annually

## Documentation
- Maintain centralized SDS file (indexed)
- Keep training records (30-year retention)
- Document incident reports
- File audit results quarterly
- Track chemical inventory with SDS dates
$$,
  'safety',
  'sop',
  ARRAY['safety', 'hazard-communication', 'chemical-safety', 'osha-compliance'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- Continue with ADMIN, ONBOARDING, EMERGENCY, and SEASONAL SOPs in next section...
-- ADMIN SOPs (26-27)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Daily Shift Briefing Procedure',
  $$# Daily Shift Briefing Procedure

## Purpose
To ensure all personnel understand daily priorities, weather impacts, equipment status, and safety hazards before beginning work.

## Scope
All maintenance and operations personnel at Veterans Memorial GC.

## Responsibilities
- Superintendent: Briefing oversight and final approval
- Assistant Superintendent: Primary briefing conductor
- Grounds Foreman: Equipment and schedule communication

## Procedure

### Briefing Schedule

**Timing**
1. Morning briefing: 0530 hours (before 0600 work start)
2. Duration: 15-20 minutes maximum
3. Afternoon briefing: 1200 hours (if afternoon crew)
4. Evening briefing: 1600 hours (if evening crew scheduled)

**Attendance**
1. Mandatory for all personnel starting shift
2. No exceptions; attendance documented
3. Late arrivals join briefing in progress
4. Essential personnel only if equipment failure (documented)

**Location**
1. Equipment shed or maintenance office (indoors)
2. Dry, sheltered location
3. Seating if available; standing acceptable
4. Whiteboard or printed agenda displayed

### Briefing Content

**1. Weather Forecast (5 minutes)**
1. Today's high/low temperature
2. Precipitation probability and timing
3. Wind direction and speed
4. UV index (high risk days)
5. Severe weather watch/warning (if any)
6. Impact on operations and schedule

**Weather-Based Adjustments**
- Rain expected: Irrigation schedule may be skipped
- High heat (>90°F): Start earlier, increase breaks
- Cold/freeze: No irrigation, potential frost delay
- Wind >15 mph: Pesticide application postponed
- Lightning risk: Evacuation procedures reviewed

**2. Daily Priorities and Schedule (5 minutes)**
1. Priority #1, #2, #3 for day (what MUST be done)
2. Holes/areas requiring focus attention
3. Tournament or event activity on course
4. Course closure or restricted access areas
5. Equipment maintenance scheduled
6. Visitor or VIP presence on course

**Priority Setting Framework**
- Green maintenance is always priority 1
- Mowing follows established schedule
- New issues addressed after routine
- Special event preparation elevated priority
- Equipment maintenance scheduled in advance

**3. Equipment Status (3 minutes)**
1. Any equipment out of service (identify which)
2. Equipment in maintenance today (availability changes)
3. Backup/loaner equipment available
4. Fuel status (low tank? need to refuel?)
5. Previous day's issues reported

**Equipment Communication**
- "Greens mower #2 in service, blades sharpened"
- "Fairway mower down; using loaner unit"
- "Irrigation pressure elevated; technician investigating"
- "Fuel level low; refill at end of shift"

**4. Safety Items (3 minutes)**
1. Heat index and heat illness prevention (if applicable)
2. Lightning risk assessment
3. Hazardous areas or temporary hazards
4. PPE reminders if not worn properly
5. Recent incidents or near-misses

**Safety Emphasis**
- "Heat index 95°F; extra water breaks every 30 minutes"
- "Lightning possible today; stay alert to sky"
- "Tree trimming ongoing at Hole 7; hazard area"
- "Hard hats required near maintenance building today"

**5. Course Conditions Report (2 minutes)**
1. Green speeds (if measured previous day)
2. Wet/soft areas requiring extra care
3. Turf stress observations
4. Disease or pest issues noted
5. Divot or damage areas

**Course Intelligence**
- "Greens running 10.0 feet; slight slow from rain"
- "Hole 6 front bunker soft; rake carefully"
- "Brown patch observed on green 12; fungicide scheduled"
- "Heavy divot wear on tee 4; priority repair today"

**6. Staffing and Assignments (2 minutes)**
1. Who is working today (check attendance)
2. Job assignments and crew compositions
3. Supervisor for each crew
4. Any new personnel or trainees
5. Absences or changes from usual roster

**Assignment Communication**
- "Greens crew: Mowing and divot repair, with Bill"
- "Fairway crew: Mowing #1-9, with Frank"
- "Rough crew: Mowing secondary fairways, with Maria"
- "New employee Jim: Safety orientation, with Dan"

**7. Communication and Questions (2 minutes)**
1. Open question period
2. Clarify assignments
3. Address safety concerns
4. Discuss unusual procedures
5. Ask for suggestions on improvements

**Q&A Encouragement**
- "Any questions about today's plan?"
- "Does anyone have concerns about conditions?"
- "Any equipment issues I should know about?"
- "Better to ask now than have confusion later"

### Pre-Briefing Preparation

**Superintendent Preparation (Day Before)**
1. Review weather forecast evening before
2. Identify priority work for next day
3. Check equipment status (any repairs needed?)
4. Note any special events or closures
5. Review previous day issues

**Morning Preparation (0500 hours)**
1. Check updated weather forecast (0500 update)
2. Verify equipment status and fuel levels
3. Note any overnight incidents or issues
4. Prepare talking points for briefing
5. Ensure meeting location is clean and ready

### Briefing Documentation

**Briefing Log**
1. Date and time of briefing
2. Attendance list (who was present)
3. Topics covered (brief notes)
4. Weather conditions communicated
5. Any safety incidents reported

**Post-Briefing Actions**
1. Brief is documented in maintenance log
2. Assignments confirmed with crew leaders
3. Any action items tracked
4. Follow-up needed items noted

### Special Briefing Situations

**Tournament Briefing (Event Day)**
1. Extend briefing time (20-30 minutes)
2. Review course setup and closing times
3. Special spectator areas and restricted zones
4. VIP or dignitary presence
5. Media access and restrictions
6. Emergency procedures for event

**Weather Emergency Briefing**
1. Heat emergency: Extra emphasis on hydration
2. Lightning threat: Evacuation procedures
3. Freezing conditions: No mowing/irrigation
4. High winds: Adjust spray patterns

**Equipment Failure Briefing**
1. Communicate workarounds clearly
2. Backup equipment assignments
3. Temporary crew reassignments
4. Timeline for repairs
5. Anticipated return to normal

### Performance and Continuous Improvement

**Briefing Effectiveness**
1. Crew members understand assignments clearly
2. Safety understanding evident
3. Equipment and condition knowledge communicated
4. No confusion or repeat questions after briefing
5. Crew ready to execute without delay

**Improvement Process**
1. Solicit feedback on briefing clarity
2. Quarterly review of briefing format
3. Adjust as needed for effectiveness
4. Incorporate lessons learned
5. Maintain consistency

## Safety Requirements
- All personnel present for briefing before work
- Safety items always included
- Hazards clearly communicated
- Weather impacts clearly stated
- Emergency procedures reviewed if needed

## Quality Standards
- Briefing conducted at consistent time
- All required topics covered
- Attendance documented
- Personnel demonstrate understanding
- Assignments clear and unambiguous

## Documentation
- Maintain daily briefing log with attendance
- Document weather and priority items
- Note any safety items or incidents
- File briefing summary in maintenance records
- Review briefing effectiveness quarterly
$$,
  'admin',
  'sop',
  ARRAY['admin', 'briefing', 'communication', 'daily-operations'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Work Order Management',
  $$# Work Order Management

## Purpose
To track, prioritize, and execute maintenance work requests in organized manner ensuring accountability and completion.

## Scope
All maintenance work requests at Veterans Memorial GC submitted by golf operations, members, or internal departments.

## Responsibilities
- Course Operations: Work request submission
- Superintendent: Work order approval and prioritization
- Assigned Crew: Completion of assigned work
- Equipment Technician: Maintenance work orders

## Procedure

### Work Order Submission

**Request Initiation**
1. Verbal request: Called or in-person to maintenance office
2. Written request: Email to superintendent@veterans-gc.mil
3. Emergency request: Direct call to superintendent
4. Form submission: Optional form (see template)

**Information Required**
1. Requestor name and department
2. Description of work needed (clear and specific)
3. Location on course (hole number, area)
4. Urgency level (routine, high priority, emergency)
5. Preferred timing/deadline
6. Requestor contact information

**Request Recording**
1. Superintendent logs all requests in Work Order Log
2. Assign work order number (sequential)
3. Assign date received
4. Note requestor and contact information
5. Track request in system for accountability

### Work Order Prioritization

**Priority Levels**

**Level 1: EMERGENCY (Address Same Day)**
- Safety hazard (broken mower creating hazard)
- Player injury or medical issue
- Water hazard (flooding, contamination)
- Irrigation failure during heat
- Equipment on fire or critical failure
- Environmental spill (chemical, fuel)

Response: Immediate assignment, all available resources

**Level 2: HIGH PRIORITY (Address Within 24 hours)**
- Disease outbreak affecting greens
- Significant equipment failure
- Irrigation system not functioning
- Severe weather damage
- Facility issue affecting operations
- Player complaints of safety issues

Response: Assign to available crew, may interrupt other work

**Level 3: STANDARD (Address Within 1 week)**
- Routine maintenance (divot repair, bunker work)
- Minor equipment repairs
- Landscaping requests
- Non-urgent facility issues
- Scheduled preventive maintenance

Response: Assign in rotation, no schedule disruption

**Level 4: DEFERRED (Schedule Discretionary)**
- Cosmetic improvements
- Long-term projects
- Non-urgent landscaping
- Planning and design work
- Low-priority equipment maintenance

Response: Schedule during off-season or low-activity periods

### Work Order Assignment

**Assignment Process**
1. Superintendent reviews new work orders daily
2. Assess against current schedule and crew availability
3. Assign appropriate crew based on required skills
4. Assign specific crew leader responsible
5. Document assignment in Work Order Log

**Assignment Criteria**
- Specialty skills required (equipment tech for electrical work)
- Crew availability and current workload
- Location efficiency (group nearby work)
- Deadline urgency
- Individual crew member expertise

**Crew Communication**
1. Verbal assignment in daily briefing
2. Written assignment on work order list posted
3. Specific instructions for complex work
4. Deadline and priority clearly communicated
5. Question period for clarification

### Work Order Execution

**Crew Responsibilities**
1. Complete work per assignment
2. Notify supervisor if unable to complete
3. Document time spent on work
4. Report any issues or complications
5. Verify work quality before sign-off

**Work Tracking**
1. Record start time and completion time
2. Note crew members involved
3. Document materials used (if applicable)
4. Photograph completion if significant work
5. Report any complications to supervisor

**Quality Verification**
1. Supervisor or team lead inspects completed work
2. Verify work meets standards and expectations
3. If unsatisfactory: Return to crew for rework
4. Document sign-off on completion

### Work Order Documentation and Follow-Up

**Documentation**
1. Work order marked COMPLETE
2. Record completion date and time
3. Log actual time spent
4. Document any issues or complications
5. Note if materials or parts were needed

**Customer Communication**
1. Notify requestor when work complete
2. Provide details of work performed
3. Request feedback on satisfaction
4. Address any follow-up needs
5. Close work order after approval

**Record Retention**
1. File completed work orders
2. Retain for minimum 1 year
3. Track work patterns (what needs most repairs?)
4. Use for trend analysis
5. Historical reference for future similar work

### System Overview and Metrics

**Work Order Statistics**
1. Track average completion time by priority level
2. Monitor work order volume per month
3. Identify most common work types
4. Measure crew efficiency and productivity
5. Identify equipment reliability issues

**Performance Review**
1. Quarterly review of work order metrics
2. Assess if priority level system working
3. Identify bottlenecks or delays
4. Adjust processes if needed
5. Communicate results to team

**Trend Analysis**
1. Monitor for increased repair needs (aging equipment)
2. Identify recurring issues (same problem repeatedly)
3. Assess staffing adequacy
4. Plan capital replacement needs
5. Budget for anticipated maintenance

### Electronic Work Order System (Optional)

**System Features**
1. Digital work order form
2. Automatic notification to assigned crew
3. Progress tracking and photo attachment
4. Time tracking per work order
5. Historical record searchable

**Benefits**
- Better tracking and accountability
- Faster communication
- Historical data analysis
- Mobile access for field crew
- Automated reporting

**Challenges**
- Technology training needed
- Backup system if technology fails
- Cost of software/hardware
- Data security considerations

### Emergency Work Order Procedures

**Emergency Work Order Activation**
1. Superintendent notified immediately (phone call)
2. Verbal description of emergency
3. Priority assigned (Level 1)
4. Superintendent authorizes immediate crew deployment
5. Work order formalized after emergency addressed

**Emergency Examples**
- Lightning strike damage
- Equipment on fire
- Player injury
- Water contamination
- Irrigation main line break

**Follow-Up Documentation**
1. After emergency addressed: Complete work order form
2. Document what happened and response
3. Identify root cause
4. Implement preventive measures
5. Review in safety committee

## Safety Requirements
- Emergency work orders activated for safety hazards
- Crew safety considered in assignments
- PPE and safety procedures followed during work
- Hazardous work assigned only to trained personnel

## Quality Standards
- All work orders assigned within 24 hours of receipt
- Completion time targets met for each priority level
- Work quality verified before completion
- Customer satisfaction maintained
- Records complete and accurate

## Documentation
- Maintain Work Order Log (digital or paper)
- File completed work orders for minimum 1 year
- Track metrics for monthly reporting
- Document emergency work orders thoroughly
- Conduct quarterly review of system effectiveness
$$,
  'admin',
  'sop',
  ARRAY['admin', 'work-orders', 'task-management', 'maintenance-tracking'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- ONBOARDING SOPs (28-29)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'New Employee Orientation Checklist',
  $$# New Employee Orientation Checklist

## Purpose
To ensure all new employees understand course operations, safety requirements, and job expectations before performing independent work.

## Scope
All new maintenance personnel hired at Veterans Memorial GC.

## Responsibilities
- Human Resources: Hire and paperwork administration
- Superintendent: Overall orientation oversight
- Assistant Superintendent: Daily orientation execution
- Equipment Technician: Equipment training

## Procedure

### Pre-Employment

**Orientation Scheduling**
1. HR confirms start date with new employee
2. Schedule orientation for first day (or day before if afternoon start)
3. Prepare workstation and locker for new employee
4. Brief existing crew on new hire arrival
5. Plan first-day assignments (light duty, shadowing)

**Materials Preparation**
1. New Employee Orientation Checklist
2. Course map and facility tour documentation
3. Equipment list and location diagram
4. Safety manuals and policies
5. Equipment operation manuals (for assigned equipment)

### Day 1: Welcome and Facility Introduction

**Morning Reception (0700-0730)**
1. Greet new employee warmly
2. Welcome to Veterans Memorial GC team
3. Briefly explain day's plan
4. Assign locker and direct to restroom facilities
5. Issue uniform and identify supplies

**Facility Tour (0730-0900)**
1. Walk entire course with guide
2. Identify all 18 holes and major features
3. Show equipment shed and maintenance area
4. Explain irrigation system location and key components
5. Point out chemical storage facility
6. Show office and break areas
7. Identify weather station and communication equipment
8. Mark on map key locations

**Administrative Tasks (0900-0930)**
1. Complete tax forms (W-4, I-9 verification)
2. Enroll in benefits (health insurance, 401k if applicable)
3. Review employee handbook
4. Explain pay schedule and timekeeping system
5. Provide employee ID and access card (if applicable)
6. Discuss schedule and shift times

### Day 1: Safety Orientation

**Safety Introduction (0930-1030)**
1. Overview of safety culture ("Everyone goes home safe")
2. OSHA requirements and military safety regulations
3. Hazard identification and reporting
4. Emergency procedures and evacuation routes
5. First aid and AED location
6. Contact information for safety officer

**PPE Fitting and Issue (1030-1100)**
1. Explain each PPE item and its purpose
2. Fit safety glasses (multiple options for comfort)
3. Fit steel-toed boots (proper sizing essential)
4. Issue hard hat and hearing protection
5. Demonstrate proper fit and adjustment
6. Practice donning/removing PPE
7. Explain care and replacement policy

**Hazard Communication (HazCom) Training (1100-1130)**
1. Explain OSHA HazCom requirements
2. Walk through SDS binder (main one in office)
3. Show how to read a Safety Data Sheet
4. Identify SDS at chemical facility
5. Explain emergency response for chemical exposure
6. Poison control number and first aid basics
7. Chemical storage and handling procedures

### Day 2: Equipment Introduction and Familiarization

**Equipment Overview (0700-0800)**
1. Walk through equipment shed with equipment technician
2. Identify each piece of equipment by name and function
3. Show daily pre-start inspection procedures
4. Explain why pre-start inspection is critical
5. Show where fuel, oil, and supplies stored
6. Identify emergency shut-off switches
7. Explain lockout/tagout procedures

**Equipment Demonstration (0800-1000)**
1. Technician demonstrates small equipment operation:
   - String trimmer
   - Handheld blower
   - Handheld pruners and rakes
2. Verbal explanation of each:
   - Starting procedure
   - Safety features
   - Stopping procedure
   - Maintenance needs
3. New employee observes operations
4. Ask questions and demonstrate understanding

**First Equipment Trial (1000-1100)**
1. Under supervision: Operate string trimmer on designated area
2. Technician coaches through operation
3. Ensure comfortable with basic controls
4. Review safety procedures
5. Gradual introduction to comfort level

**Equipment Off-Limits Initially**
1. Large mowers (requires operator certification)
2. Aerial lift equipment (requires training and certification)
3. Heavy equipment (requires special training)
4. Spray equipment (requires pesticide applicator license)
5. Explain timeline for these certifications

### Days 3-5: Task Training and Shadowing

**Job Assignment Overview (Day 3)**
1. Assign to crew based on skills and interests
2. Explain primary responsibilities
3. Shadowing with experienced crew member
4. Observe safe work practices and techniques
5. Ask questions as they come up

**Shadowing Program**
1. Days 3-5: Observe experienced crew member
2. Assist with tasks (helping, not operating)
3. Learn course layout and maintenance areas
4. Understand daily schedule and rhythm
5. Build relationships with crew members

**Task-Specific Training (Day 4)**
1. Explain assigned primary task (e.g., bunker raking)
2. Demonstrate proper technique
3. Discuss quality standards and expectations
4. Show final result and quality level
5. Practice under supervision
6. Provide feedback and correction

**Increasing Responsibility (Day 5)**
1. Perform task with minimal supervision
2. Supervisor checks work quality
3. Provide feedback and additional instruction if needed
4. Gradually move toward independence
5. Outline next learning objectives

### Week 2: Increasing Independence

**Supervised Work (Week 2)**
1. Continue learning additional tasks
2. Perform primary task independently
3. Supervisor spot-checks work throughout day
4. Provide feedback and correction
5. Introduce more complex tasks

**Equipment Operation Training (Week 2)**
1. Begin handheld equipment operation independently
2. Practice under supervision first
3. Demonstrate understanding of safety
4. Gradually expand to more complex equipment
5. Small mower operation (if within scope)

**Course Knowledge Building**
1. Begin to recognize course patterns and conditions
2. Understand seasonal maintenance schedule
3. Learn names of holes and locations
4. Identify common problem areas
5. Ask questions about course history

### Month 1-3: Probationary Period

**Ongoing Training**
1. Introduction to larger equipment (if appropriate)
2. Cross-training on multiple positions
3. Exposure to different seasons and conditions
4. Safety training updates (HazCom, heat, lightning)
5. Equipment-specific certifications if needed

**Performance Evaluation**
1. Informal check-ins throughout month 1
2. Formal evaluation at 30 days
3. Assess: Quality of work, safety compliance, attitude, teamwork
4. Identify strengths and areas for improvement
5. Discuss career path and training goals

**Extended Training Needs**
1. Specialized equipment operation (large mowers)
2. Pesticide applicator license (if needed)
3. Heavy equipment certification
4. Leadership or supervisory training
5. Specialized turf management training

### Certification and Credentialing

**Safety Training Certification**
1. OSHA 10-hour course (online or in-person)
2. First Aid and CPR certification
3. HazCom training certification
4. Heat illness awareness certification
5. Lightning safety certification

**Equipment Operation Certifications**
1. Heavy equipment operation (if needed)
2. Boom lift or aerial lift (if needed)
3. Specific equipment manufacturer training (if required)
4. Pesticide applicator license (if applying chemicals)

**Military Installation Requirements**
1. Military base ID and access badge
2. Vehicle registration on base
3. Background check completion
4. Facility security briefing
5. Environmental compliance briefing

### Orientation Checklist Completion

**Checklist Review**
1. Superintendent reviews completed checklist
2. Verify all items completed and documented
3. Identify any missing training or certifications
4. Schedule any outstanding training
5. Sign off on completion

**New Employee Sign-Off**
1. Employee confirms understanding of expectations
2. Employee signs acknowledgment of safety training
3. Employee acknowledges receipt of handbook
4. Employee confirms questions answered
5. Supervisor signature confirming completion

**File Documentation**
1. Completed checklist filed in personnel file
2. Training certificates filed
3. Equipment certifications documented
4. Note any accommodations or restrictions
5. Establish timeline for follow-up certifications

## Safety Requirements
- All safety training completed before independent work
- PPE properly fitted and issued
- Equipment operation training documented
- Emergency procedures understood
- No independent work until supervisor approval

## Quality Standards
- All checklist items completed
- New employee demonstrates understanding
- Safety knowledge confirmed through Q&A
- Equipment operation competency verified
- Clear expectations established

## Documentation
- Complete New Employee Orientation Checklist
- File all training certificates
- Document equipment operation training
- Record equipment certifications
- Maintain in personnel file for 30+ years
$$,
  'onboarding',
  'sop',
  ARRAY['onboarding', 'training', 'new-employee', 'orientation', 'safety'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Equipment Operation Certification',
  $$# Equipment Operation Certification

## Purpose
To ensure only trained, competent personnel operate golf course maintenance equipment, preventing accidents and equipment damage.

## Scope
All motorized equipment at Veterans Memorial GC that requires technical skill or creates safety risk.

## Responsibilities
- Equipment Technician: Training delivery and certification
- Superintendent: Approval of certifications
- Operators: Achieving and maintaining certifications

## Procedure

### Equipment Requiring Certification

**Tier 1: Handheld Power Equipment (Minimal Training)**
- String trimmer/weed whacker
- Handheld blower
- Hedge trimmer
- Chainsaw (more training required)
- Requires: Verbal instruction + hands-on demonstration

**Tier 2: Small Motorized Equipment (Moderate Training)**
- Greens mower (walk-behind or riding)
- Rough mower
- Tiller or aerator
- Requires: Written exam + hands-on certification + signed agreement

**Tier 3: Large Motorized Equipment (Advanced Training)**
- Fairway mower (7-gang or larger)
- Tractor with attachments
- Heavy equipment (if used)
- Requires: Advanced hands-on + extensive practice + written exam + signed safety agreement

**Tier 4: Specialized Equipment (Licensing Required)**
- Aerial lift/boom lift (OSHA certified)
- Pesticide application equipment (EPA licensing)
- Requires: Professional third-party certification + licensing

### Certification Process for Tier 2 Equipment

**Prerequisites**
1. New employee must complete orientation
2. Demonstrate maturity and responsibility
3. Supervisor recommendation
4. Minimum 1 week of general grounds experience
5. Pass safety knowledge quiz (basic safety only)

**Training Phase (1 week, 5-8 hours)**

**Day 1: Equipment Classroom Training**
1. History and purpose of equipment
2. Safety features and controls overview
3. Daily pre-start inspection procedure
4. Review operator manual sections
5. Explain maintenance requirements

**Day 2-3: Hands-On Demonstration**
1. Equipment technician demonstrates operation:
   - Starting procedure (cold start)
   - Engine warm-up and idle
   - Blade engagement/disengagement
   - Forward/reverse motion control
   - Stopping and shutdown procedure
2. Operator observes and asks questions
3. Review safety rules for equipment use
4. Point out common mistakes and hazards

**Day 4: Supervised Operation**
1. Operator starts equipment under supervision
2. Perform controlled movements (no mowing yet)
3. Practice engagement/disengagement of controls
4. Execute parking and shutdown
5. Technician observes and coaches
6. Repeat until operator confident

**Day 5: Trial Run with Supervision**
1. Operator mows small area under close supervision
2. Technician provides feedback in real-time
3. Correct any technique issues
4. Demonstrate understanding of controls
5. Show proper mowing pattern and consistency

**Written Exam (30 minutes)**
1. Equipment identification and parts
2. Daily pre-start inspection procedures
3. Operating controls and their function
4. Safety rules and hazard recognition
5. Maintenance and post-operation requirements
- Passing score: 80% minimum
- If failed: Re-training required, re-test in 3-5 days

**Final Hands-On Exam (1 hour)**
1. Operate equipment in realistic scenario
2. Demonstrate pre-start inspection
3. Start equipment safely
4. Perform controlled mowing/operation
5. Demonstrate proper shutdown
6. Clean and secure equipment
- Passing criteria: Safe operation, proper technique, good control
- If failed: Additional training required, retry in 1 week

**Certification Documentation**
1. Equipment Operator Certification form signed
2. Training log with dates and hours
3. Written exam results filed
4. Hands-on exam results documented
5. Operator photo with equipment (for ID purposes)
6. Certificate issued to operator
7. Original filed with training records

### Certification for Tier 3 Equipment (Advanced)

**Prerequisites**
1. Minimum 6 months experience with Tier 2 equipment
2. Demonstrated maturity and responsibility
3. No recent safety violations
4. Supervisor recommendation
5. Pass general safety knowledge test

**Advanced Training Requirements (2-3 weeks, 20-40 hours)**
1. Extended hands-on training with technician
2. Field operation under supervision (multiple days)
3. Complex maneuvering and technique
4. Equipment maintenance training
5. Problem-solving for equipment issues
6. Advanced pre-start inspection procedures

**Advanced Certification**
1. Written exam (100 questions, 80% passing)
2. Hands-on exam (realistic working scenario)
3. Equipment skill demonstration
4. Safety knowledge assessment
5. Signed operator agreement

**Annual Recertification for Advanced Equipment**
1. Annual skill check (no written exam)
2. Hands-on demonstration of safe operation
3. Update on any procedure changes
4. Review of recent safety incidents
5. Signed annual certification

### Certification for Specialized Equipment

**Aerial Lifts (Boom Lifts, Boom Trucks)**
1. OSHA-compliant training required
2. Third-party certification provider
3. Minimum 8-hour course plus hands-on
4. Written exam and practical assessment
5. Certificate valid for 3 years (recertification required)
6. No substitutes for OSHA requirements

**Pesticide Application Equipment**
1. EPA Pesticide Applicator License required (separate from equipment cert)
2. Equipment operation training separate from pesticide knowledge
3. Technician demonstrates equipment operation
4. Practice spraying on non-course area
5. Hazard communication training and SDS knowledge
6. Document certification with license

### Operator Certification Maintenance

**Annual Recertification**
1. Review of safety procedures and rules
2. Hands-on skill check by supervisor
3. Short written quiz (refresher, not full exam)
4. Update on any equipment or procedure changes
5. Document recertification with signature

**Recertification Triggers**
1. Automatic: At 1-year anniversary of certification
2. After extended absence (>6 months not using equipment)
3. After safety incident involving equipment
4. After equipment modification or update
5. Supervisor discretion for performance concerns

**Decertification**
1. Safety violation (unsafe operation)
2. Equipment damage due to operator error
3. Failure of recertification test/skill check
4. Request by operator to remove certification
5. Change in job duties making equipment unnecessary

**Decertification Consequences**
1. Equipment may not be operated
2. If other assignments available: Reassignment
3. If no other work available: Disciplinary action per policy
4. Re-certification possible after training and time period
5. Multiple decertifications may lead to termination

### Record Keeping and Compliance

**Certification Files**
1. Maintain file for each certified operator
2. Original certification certificate (scanned)
3. Training log and exam results
4. Annual recertification records
5. Any incident reports involving operator
6. Equipment operation hours log (optional)

**Database Maintenance**
1. Keep list of all certified operators by equipment
2. Track certification expiration dates
3. Alert supervisors when recertification due
4. Document any decertifications
5. Historical record for trend analysis

**Compliance Monitoring**
1. Monthly supervisor review of operator certifications
2. Verify only certified personnel operating equipment
3. Spot-check for compliance during operations
4. Address any non-compliance immediately
5. Document monitoring activities

### Training Documentation

**Training Plan Development**
1. Assess operator skill level and learning pace
2. Identify learning needs
3. Create customized training schedule
4. Assign trainer/technician
5. Establish milestones and checkpoints

**Training Completion**
1. All training elements completed and documented
2. Hands-on proficiency demonstrated
3. Knowledge assessment passed
4. Safety understanding confirmed
5. Certification issued upon completion

## Safety Requirements
- Certification mandatory before independent operation
- Training documented with signatures
- Recertification annual minimum
- Non-compliance addressed immediately
- Emergency procedures understood and practiced

## Quality Standards
- Certification exam passing score 80% minimum
- Hands-on demonstration meets quality standards
- Operators demonstrate safe technique
- Equipment operated safely by all certified personnel
- Training records complete and accurate

## Documentation
- Maintain certification records for each operator
- File training plans and completion
- Document all exam results (written and practical)
- Track recertification dates and completions
- Maintain equipment operation hours (optional)
- File decertifications and reasons
$$,
  'onboarding',
  'sop',
  ARRAY['onboarding', 'equipment-certification', 'training', 'competency'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- EMERGENCY SOPs (30-32)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Severe Weather Response Plan',
  $$# Severe Weather Response Plan

## Purpose
To protect personnel and golfers from severe weather hazards through advance preparation, timely response, and safe shelter procedures.

## Scope
All personnel and golfers at Veterans Memorial GC during severe weather events (thunderstorms, straight-line winds, tornadoes, ice/snow storms).

## Responsibilities
- Safety Officer: Weather monitoring and decisions
- Course Operations: Player evacuation and facility closing
- Maintenance Crew: Facility protection and cleanup

## Procedure

### Severe Weather Types and Definitions

**Severe Thunderstorm**
- Lightning present (covered separately in Lightning Safety Protocol SOP)
- Heavy rain (1+ inch per hour)
- Straight-line winds (>40 mph)
- Large hail (>0.75 inch diameter)

**Tornado Watch**
- Atmospheric conditions favorable for tornado development
- No tornado sighted or reported
- Continue operations with caution
- Monitor weather service alerts

**Tornado Warning**
- Tornado sighted or radar-indicated
- Immediate evacuation required
- Seek shelter in substantial building
- Do not attempt to outrun tornado in vehicles

**Winter Storm**
- Heavy snow (>4 inches in 12 hours)
- Ice accumulation (>0.25 inch)
- Blizzard conditions (wind >35 mph, poor visibility)

**Extreme Heat Warning**
- Heat index >105°F for extended period
- Course may close; operations modified

**Extreme Cold Warning**
- Temperature <-10°F or wind chill <-20°F
- Frostbite risk in 30 minutes
- Operations curtailed

### Weather Monitoring Procedures

**Continuous Monitoring**
1. Check National Weather Service alerts every 2 hours (during season)
2. Monitor weather radar for storm development
3. Listen for lightning and observe sky
4. Receive emergency alerts on phone/radio
5. Subscribe to NOAA weather alerts for county

**Alert Levels**

**ADVISORY (Yellow) - Monitor Conditions**
- Weather watch issued by National Weather Service
- Conditions may deteriorate
- Continue operations with caution
- Monitor weather service updates frequently
- Be prepared to implement response

**ALERT (Orange) - Prepare for Action**
- Severe weather watch issued
- High probability of severe conditions
- Begin preparation for potential closure
- Gather personnel; stand by for decision
- Position equipment to safe location

**WARNING (Red) - Immediate Action**
- Severe weather warning or tornado warning
- Immediate threat to personnel and players
- Evacuate course immediately
- Seek shelter in substantial building
- Implement full response procedures

### Preparation Phase (Before Storm Arrival)

**When Advisory Issued**
1. Activate emergency communication system
2. Brief all personnel on weather situation
3. Begin preparations for potential response
4. Notify golf shop of possible closure
5. Position vehicles and equipment safely

**Equipment Protection**
1. Move portable equipment indoors (fuel cans, ladders, etc.)
2. Secure large equipment (mowers, aerators) in shed if possible
3. Close any open buildings and windows
4. Remove flag sticks from greens if tornado risk
5. Cover exposed materials

**Personnel Assembly**
1. Brief personnel on weather warning
2. Identify shelter locations and routes
3. Ensure personnel stay close to buildings
4. Cancel outdoor work and bring inside
5. Establish accountability system

### Response Phase (During Storm)

**Severe Thunderstorm Response**
1. Evacuate course (blow evacuation signal)
2. All personnel to shelter (clubhouse or maintenance building)
3. Players directed to clubhouse
4. Golf carts left on course (do not risk retrieval)
5. Secure equipment left on course
6. Wait for all-clear signal

**Straight-Line Wind Response**
1. If wind gusts >40 mph observed:
   - Evacuate course immediately
   - Personnel to shelter
   - Account for all personnel
   - Monitor for additional weather threats
2. Scan for downed trees and debris hazards
3. Do not resume operations until all-clear

**Tornado Warning Response**
1. Immediate evacuation to shelter (BASEMENT PREFERRED)
2. Do not attempt to move vehicles
3. Leave golf carts and equipment
4. Move away from windows
5. Shelter in interior room or basement
6. Wait until warning expires (usually 30-45 minutes)
7. Cautiously emerge after warning expires

**Hail/Heavy Rain Response**
1. Evacuate if hail significant (>0.75 inch)
2. Players and personnel to shelter
3. Monitor for flooding if heavy rain (>1 inch/hour)
4. Check drainage and runoff
5. Resume operations when rain stops

**Winter Storm Response**
1. Close course if snow >2 inches forecasted in 24 hours
2. Send personnel home before conditions deteriorate
3. Reduce maintenance crew to essential personnel only
4. Snow removal and ice management priority
5. Monitor visibility and travel safety

### Post-Storm Assessment and Cleanup

**Immediate Assessment (After Warning Expires)**
1. Safety Officer walks course for damage
2. Check for downed trees, branches, debris
3. Inspect for water damage or flooding
4. Check irrigation system functionality
5. Document damage with photographs

**Hazard Mitigation**
1. Remove large debris (branches, tree limbs)
2. Mark any hazardous areas (downed power lines, etc.)
3. Clear cart paths of debris
4. Ensure greens and fairways playable
5. Call utilities if power lines down (do not touch)

**Equipment Inspection**
1. Inspect all equipment for weather damage
2. Check mowers, irrigation, vehicles
3. Clean equipment if mud accumulated
4. Dry equipment if wet from rain
5. Test before returning to service

**Course Reopening**
1. Assess playability (wet conditions, damage)
2. Clean and prepare for play
3. Remove flags and tee markers if stored
4. Verify irrigation operational
5. Brief players on any damage or hazards

**Communication**
1. Inform golf shop when course ready to reopen
2. Notify players of any closures or delays
3. Brief crew on what to expect
4. Update management on damage assessment
5. Notify military command if significant damage

### Facility Protection During Storms

**Clubhouse Protection**
1. Close all windows and doors
2. Move outdoor furniture indoors
3. Secure entrance areas
4. Prepare for potential water infiltration
5. Have towels/mops available for cleanup

**Equipment Shed Protection**
1. Close and secure all doors
2. Move equipment away from windows
3. Shut off utilities if high wind risk
4. Prepare for potential water infiltration
5. Have drainage plan for water management

**Utilities Management**
1. Know location of electrical breaker
2. Know location of water shutoff
3. Turn off unnecessary systems during storm
4. Secure any outdoor utility equipment
5. Have backup generator available if critical

### Special Situations

**Storm Approaching During Tournament**
1. Cease play and evacuate course
2. Announce suspension clearly to all players
3. Provide updates on weather
4. Estimate resumption time if possible
5. Prepare for resume or cancellation decision

**Multiple Storms in Single Day**
1. Implement full response procedures for each storm
2. Do not reduce caution due to multiple events
3. Maintain full shelter compliance each time
4. Safety first, schedule second

**Power Outage from Storm**
1. Assess scope of outage (course-wide or partial)
2. Notify base power authority
3. Operations may continue if safe
4. Check irrigation system (may be electric)
5. Use generator power for critical systems

**Flooding from Heavy Rain**
1. Monitor drainage system
2. Close greens if water standing on surface
3. Assess for groundwater rise
4. Check irrigation system for overflow
5. Document flooding for future drainage planning

### Training and Preparedness

**Annual Weather Safety Drill**
1. Conduct mock evacuation (no actual weather)
2. Test evacuation routes and shelter functionality
3. Test communication system
4. Account for all personnel
5. Document drill completion

**Personnel Training**
1. April 1: Annual weather safety training
2. Review different weather scenarios
3. Explain evacuation routes and shelter locations
4. Discuss personal preparedness
5. Q&A and certification

**Weather Station and Equipment**
1. Maintain weather station on course
2. Verify equipment functioning correctly
3. Test rain gauge and wind instruments
4. Ensure data downloads/records
5. Alert system testing monthly

### Documentation and Records

**Incident Log**
1. Record all severe weather events
2. Document date, time, type of weather
3. Note if evacuation necessary
4. Document damage observed
5. Record personnel accounted for

**Storm Damage Documentation**
1. Photograph all damage
2. Document repair costs
3. Note trees/vegetation damage
4. Report to insurance if applicable
5. File for military reimbursement if needed

**Response Effectiveness Review**
1. Quarterly review of response procedures
2. Identify what worked well
3. Identify areas for improvement
4. Update procedures as needed
5. Communicate changes to team

## Safety Requirements
- Weather monitoring continuous during season
- Immediate evacuation for severe weather warning
- Shelter in substantial building (basement preferred for tornado)
- 30-minute wait after last warning expires
- No resumption of play if unsafe

## Quality Standards
- Course safely inspected after every storm
- Hazards removed or marked
- All personnel accounted for
- Equipment functioning before return to service
- Documentation complete

## Documentation
- Maintain severe weather incident log
- File storm damage photographs
- Document all evacuations
- Record training and drills
- Annual review of procedures
$$,
  'emergency',
  'sop',
  ARRAY['emergency', 'severe-weather', 'response', 'evacuation', 'safety'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Chemical Spill Response',
  $$# Chemical Spill Response

## Purpose
To immediately contain and safely clean up chemical spills, protecting personnel, environment, and golf course.

## Scope
All chemical spills at Veterans Memorial GC including pesticides, fertilizers, fuels, and herbicides.

## Responsibilities
- Incident First Responder: Initial containment
- Safety Officer: Spill assessment and escalation
- Hazmat Team: Major spill response (>5 gallons)

## Procedure

### Spill Size Categories and Response Levels

**Reportable Spill Size**
- Small: <1 gallon (contained response)
- Medium: 1-5 gallons (controlled response)
- Large: >5 gallons (professional hazmat response)

**Reportable to Authorities**
- Any spill reaching water
- Any spill leaving property boundaries
- Any spill of unknown quantity
- Any spill causing vapor or fume hazard
- All spills >5 gallons

### Immediate Response (First Responder)

**Personal Safety First**
1. If hazardous vapors present: EVACUATE IMMEDIATELY
2. Do not enter area without proper PPE
3. Do not attempt rescue without proper training
4. Alert other personnel to stay clear
5. Call for professional help immediately if needed

**Emergency Medical**
1. If personnel exposed:
   - Move to fresh air immediately
   - Remove contaminated clothing
   - Rinse with water if skin exposure
   - Seek medical attention
   - Call 911 for severe exposure

**Containment of Small Spill (<1 gallon)**
1. Stop the spill if safe to do so:
   - Close container valve if accessible
   - Move container away from spillage
   - Do not touch or move container if unsafe
2. Alert nearby personnel (audible warning)
3. Establish perimeter: Keep bystanders back
4. Don personal protective equipment:
   - Chemical-resistant gloves
   - Safety glasses
   - Apron or coveralls if available
5. Place absorbent material around spill:
   - Use sand, kitty litter, or commercial absorbent
   - Pile absorbent on outer edge of spill
   - Allow absorbent to saturate with liquid
   - Consolidate absorbent toward center

**Spill Containment of Medium Spill (1-5 gallons)**
1. Same as small spill but with greater urgency
2. Call Safety Officer immediately (do not wait for containment)
3. Use greater volume of absorbent material
4. Establish larger perimeter (10-15 feet minimum)
5. Prevent spill from reaching storm drains or water sources:
   - Block drain openings with sand bags if nearby
   - Channel flow away from water sources
6. Do not attempt if hazardous or dangerous vapors
7. Safety Officer makes decision on additional help

**Large Spill (>5 gallons) - DO NOT ATTEMPT CLEANUP**
1. EVACUATE IMMEDIATE AREA (minimum 100 feet)
2. CALL SAFETY OFFICER IMMEDIATELY
3. Do not enter spill area
4. Do not attempt containment
5. Prevent others from entering area
6. Wait for professional hazmat team

### Safety Officer Spill Assessment

**Initial Assessment**
1. Verify spill location and extent
2. Identify chemical (check label or SDS)
3. Determine type of chemical (flammable, toxic, etc.)
4. Assess if water sources threatened
5. Evaluate personnel exposure risk
6. Determine spill size (estimate quantity)

**Small Spill Response (<1 gallon)**
1. Verify first responder has containment proceeding
2. Ensure proper PPE being used
3. Collect saturated absorbent in container
4. Dispose of absorbent as hazardous waste (if chemical hazardous)
5. Clean area with soap and water
6. Decontaminate any equipment used

**Medium Spill Response (1-5 gallons)**
1. Determine if professional help needed:
   - If highly toxic or volatile: Call hazmat
   - If water threatened: Call environmental officer
   - If uncertain: Err on side of caution, call for help
2. If proceeding with internal response:
   - Expand containment efforts
   - Use greater volume of absorbent
   - Prevent water/soil contamination
   - Collect absorbent carefully
   - Dispose as hazardous waste

**Large Spill (>5 gallons)**
1. CALL HAZMAT TEAM IMMEDIATELY
2. Provide information:
   - Chemical identity and EPA registration
   - Estimated quantity spilled
   - Location and any water threats
   - Personnel exposure information
   - Weather conditions (wind, rain)
3. Establish evacuation zone (100+ feet)
4. Prevent unauthorized entry
5. Collect SDS for responders
6. Wait for professional team

### Cleanup and Decontamination

**Small Spill Cleanup**
1. Use absorbent to soak up remaining liquid
2. Collect absorbent in hazardous waste container
3. Repeat process until all liquid absorbed
4. Clean area with soap and water
5. Allow area to dry
6. Document spill and cleanup actions
7. Dispose of absorbent properly

**PPE Decontamination After Cleanup**
1. Remove contaminated gloves
2. Place in hazardous waste bag (if chemical hazardous)
3. Wash hands thoroughly with soap and water
4. Rinse any contaminated clothing
5. Change clothes if necessary
6. Shower if significant exposure

**Equipment Decontamination**
1. Rinse any equipment that contacted spill
2. Use absorbent material if dry chemical
3. Wash with soap and water if liquid
4. Air dry before storage
5. Inspect for remaining contamination

### Disposal of Spill Waste

**Hazardous Waste Disposal**
1. Place absorbent/contaminated material in hazardous waste container
2. Label container with:
   - Chemical name
   - Spill date
   - Quantity
   - "HAZARDOUS WASTE"
3. Do not dispose in trash or water systems
4. Coordinate with licensed hazardous waste contractor
5. Maintain documentation of disposal

**Non-Hazardous Spill Disposal**
1. Fertilizer spills may be appropriate for landfill
2. Consult SDS to determine hazard classification
3. If non-hazardous: May dispose in regular trash
4. Document disposal method

### Water or Soil Contamination Response

**Water Contamination**
1. If spill reaches course water features:
   - Immediately notify environmental officer
   - Assess impact on course and wildlife
   - Implement remediation (may require professional)
   - Monitor water quality
   - Restrict access if contaminated
2. If spill reaches storm drain:
   - Notify base environmental officer
   - Trace discharge location
   - Implement containment if possible
   - Coordinate cleanup with utilities

**Soil Contamination**
1. If soil contamination suspected:
   - Mark contaminated area
   - Restrict access until remediated
   - Excavate contaminated soil if necessary
   - Dispose of soil as hazardous waste
   - Replace with clean fill
   - Restore area

### Regulatory Reporting

**Reportable Spills**
1. Any spill reaching water sources: REPORT
2. Any spill >5 gallons: REPORT
3. Any persistent contamination: REPORT
4. Any environmental threat: REPORT

**Reporting Process**
1. Contact Military Environmental Compliance Officer
2. Provide incident details and SDS
3. Document response and cleanup
4. File incident report within 24 hours
5. Retain documentation for 5+ years

**Documentation for Report**
1. Spill date, time, and location
2. Chemical identity and quantity
3. Cause of spill
4. Response actions taken
5. Cleanup completion date
6. Environmental impact assessment
7. Corrective actions implemented

### Prevention of Future Spills

**Root Cause Analysis**
1. After significant spill: Conduct analysis
2. Identify what caused spill
3. Determine if preventable
4. Implement controls to prevent recurrence
5. Document findings and corrective actions

**Preventive Measures**
1. Improve storage secondary containment
2. Provide better spill kit accessibility
3. Enhanced PPE availability
4. Better labeling and organization
5. More frequent inspections
6. Personnel training enhancements

### Training and Preparedness

**Annual Spill Response Training**
1. Review SDS identification
2. Demonstrate spill containment
3. Review disposal procedures
4. Identify reportable spills
5. Hands-on practice with absorbent material

**Spill Kit Maintenance**
1. Verify spill kits stocked and accessible
2. Check absorbent material quantity
3. Verify PPE available and functional
4. Check disposal containers available
5. Document kit inspections

## Safety Requirements
- Immediate evacuation for large spills (>5 gallons)
- Proper PPE worn during cleanup
- Professional hazmat response for toxic chemicals
- Water sources protected from contamination
- Personnel decontamination after exposure

## Quality Standards
- Small spills contained and cleaned within 2 hours
- Area decontaminated and safe for reuse
- Waste properly disposed as hazardous
- Documentation complete and filed
- Environmental damage minimized

## Documentation
- Spill incident report filed immediately
- Chemical SDS attached to report
- Response actions documented
- Cleanup verification documented
- Root cause analysis for significant spills
- Corrective action plan filed
$$,
  'emergency',
  'sop',
  ARRAY['emergency', 'chemical-spill', 'hazmat', 'environmental', 'response'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Medical Emergency Response',
  $$# Medical Emergency Response

## Purpose
To provide immediate, appropriate response to medical emergencies at Veterans Memorial GC, maximizing chance of survival and recovery.

## Scope
All personnel and golfers at Veterans Memorial GC; applicable to injuries, illnesses, and medical crises.

## Responsibilities
- First Responder: Initial assessment and first aid
- Supervisor: Emergency coordination
- AED/CPR Trained Personnel: Life support measures
- Emergency Services (911): Professional medical care

## Procedure

### Recognition of Medical Emergency

**Chest Pain or Difficulty Breathing**
- Chest pain or pressure (may radiate to arms, jaw, back)
- Shortness of breath or rapid breathing
- Sweating, nausea, dizziness
- Possible heart attack or stroke warning

**Unconsciousness or Collapse**
- Person unresponsive
- May or may not have pulse
- CPR may be needed
- Call 911 immediately

**Severe Bleeding**
- Uncontrolled blood flow
- Bleeding from wounds (especially head, neck, torso)
- Shock symptoms (pale, clammy, rapid pulse)
- Life-threatening within minutes

**Head/Spinal Injury**
- Unconsciousness or altered consciousness
- Neck or back pain
- Loss of sensation or movement
- Severe headache

**Allergic Reaction**
- Difficulty breathing or swelling of throat
- Rash or hives
- Dizziness or fainting
- Anaphylaxis (life-threatening)

**Choking**
- Unable to speak or cry out
- Weak or no cough
- Difficulty breathing or wheezing
- Complete airway obstruction possible

### Immediate Response Actions

**1. ASSESS SITUATION - Is Scene Safe?**
- Check if area is safe to approach
- Hazards present (traffic, chemicals, electrical)
- If unsafe: Do not approach; call 911 and wait for emergency services

**2. CALL FOR HELP - ACTIVATE EMERGENCY SYSTEM**
- Yell for nearby personnel
- Send someone to get AED device
- Call 911 from cell phone or course phone
- Provide dispatcher with information:
  - Nature of injury/illness
  - Location on course (hole number, description)
  - Number of people affected
  - Age and gender of victim (if known)
  - Any hazards present
  - Give phone number for callback

**3. CHECK RESPONSIVENESS**
- Tap on shoulder and shout "Are you okay?"
- Check if unconscious
- Check if breathing

**Unconscious and Not Breathing:**
- Immediately begin CPR if trained
- Place victim on firm, flat surface
- Clear airway (remove obstructions)
- Position for recovery if breathing

**Unconscious and Breathing:**
- Place in recovery position (on side)
- Monitor breathing
- Do not move if spinal injury possible
- Keep warm with blanket if available

**4. PERFORM FIRST AID (If Trained)**

### Common Injuries and First Aid

**Severe Bleeding**
1. Call 911 (already done)
2. Apply direct pressure with cloth
3. Do not remove cloth if blood soaks through; add more cloth on top
4. Maintain pressure for 10-15 minutes
5. Elevate limb above heart if possible (unless spinal injury)
6. Apply pressure to artery if bleeding continues
7. Apply tourniquet above wound if life-threatening bleeding
8. Do not remove tourniquet; let emergency services remove

**Heat Exhaustion**
1. Move to shade
2. Lie down, elevate feet
3. Cool body: Apply cool water, ice packs, fan
4. Give water to drink (if conscious and able to swallow)
5. Monitor for improvement
6. Seek medical attention if not improving

**Heat Stroke (Emergency)**
1. Call 911 immediately
2. Move to shade
3. Cool aggressively: Ice water, ice packs, spray bottle
4. Remove excess clothing
5. Do not give water if unconscious
6. Monitor breathing and consciousness
7. CPR if needed

**Choking**
1. Ask "Are you choking?" (they cannot respond if completely obstructed)
2. Perform Heimlich maneuver:
   - Stand behind victim
   - Place fist just above navel
   - Grasp fist with other hand
   - Thrust upward, repeat until object dislodges
3. If unconscious: Open airway, sweep mouth, attempt rescue breathing
4. Call 911 if object not dislodged within 1 minute

**Cardiac Arrest (No Responsiveness, No Breathing)**
1. Call 911 (should already be called)
2. Begin CPR if trained:
   - Hand position: Center of chest, between nipples
   - Compression rate: 100-120 compressions per minute
   - Compression depth: 2-2.4 inches (push hard and fast)
   - Airway: Open airway with head-tilt, chin-lift
   - Breathing: Give 2 rescue breaths after 30 compressions
   - Continue until: Emergency services arrive, AED used, victim recovers
3. Use AED as soon as available:
   - Turn on AED
   - Follow voice prompts
   - Apply pads to chest per instructions
   - Allow AED to analyze heart rhythm
   - Deliver shock if advised
   - Resume CPR after shock

**Allergic Reaction/Anaphylaxis**
1. Call 911 for difficulty breathing or throat swelling
2. If victim has EpiPen (epinephrine auto-injector):
   - Retrieve if possible
   - Follow victim's instructions (or call 911)
   - Inject into thigh as instructed (usually through clothing okay)
3. Position sitting up (easier breathing) unless unconscious
4. Monitor breathing
5. Second EpiPen may be given 5-15 minutes later if needed
6. Emergency services will transport for observation

**Unconsciousness**
1. Check responsiveness and breathing
2. If breathing: Place in recovery position (on side)
3. If not breathing: Begin CPR
4. Call 911 if not already called
5. Monitor breathing and responsiveness
6. Do not move if spinal injury possible
7. Keep airway open
8. Monitor for vomiting (turn head if occurs)

### AED (Automated External Defibrillator) Use

**AED Location and Availability**
1. AED device in clubhouse (main location)
2. AED in maintenance building (secondary location)
3. All locations marked with signage
4. Accessible during all operating hours
5. Checked monthly for functionality

**AED Operation**
1. Turn on AED (power button)
2. Follow voice prompts from device
3. Apply adhesive pads to victim's chest:
   - Right pad: Upper right chest
   - Left pad: Lower left chest
   - Do not apply if on medication patch (move patch first)
4. Allow AED to analyze heart rhythm
5. If shock advised: Ensure no one touching victim
6. Press shock button (or automatic shock)
7. Resume CPR immediately after shock
8. Continue until emergency services arrive

**AED Maintenance**
1. Monthly functionality check
2. Verify battery status (light indicator)
3. Check pads expiration date (replace if expired)
4. Clean exterior if needed
5. Keep accessible and charged

### Recovery and Post-Emergency

**After Emergency Services Arrive**
1. Brief emergency responders on situation
2. Provide medical history if known
3. Give AED printout if available (shows heart rhythm data)
4. Provide SDS if chemical exposure
5. Allow emergency services to take over

**Course Closure Decision**
1. If incident significant: Course may close for remainder of day
2. Supervisor decision based on circumstances
3. Notify golf shop and pro to inform remaining players
4. Resume play once area cleared and safe

**Incident Documentation**
1. Record date, time, location of incident
2. Name and basic info of victim (if known)
3. Nature of illness or injury
4. Actions taken by first responders
5. Emergency services called and time
6. Medical outcome (transported, treated at scene, refused care)
7. Witnesses present (names and contact)
8. Submit report to supervisor and safety officer

### Training and Certification

**Required Certifications**
1. Superintendent: CPR/AED certification (current)
2. Assistant Superintendent: CPR/AED certification (current)
3. All supervisors: CPR/AED certification (current)
4. Equipment Technician: First aid certification (current)

**Recommended Certifications**
1. Greens Crew Lead: CPR/AED certification
2. Course Operations: CPR/AED certification
3. All personnel: First aid certification

**Training Frequency**
1. CPR/AED: Recertification every 2 years
2. First Aid: Recertification every 2-3 years
3. Annual refresher: Internal course on medical response
4. New hire: Orientation on AED location and use

**Maintained Equipment**
1. First aid kits in office and maintenance building
2. CPR ventilation mask available
3. Emergency blanket and stretcher available
4. Trauma supplies (bandages, gauze, tape)
5. Cold packs for injuries

### Emergency Contact Information

**Base Emergency Services**
- 911: Emergency response (fire, ambulance, police)
- Non-emergency: [Base phone number]
- Hospital: Great Lakes Naval Base Hospital, [phone]

**Poison Control**
- National Poison Control: 1-800-222-1222 (24/7)

**Course Emergencies**
- Superintendent: [Cell phone number]
- Safety Officer: [Cell phone number]
- Pro Shop: [Course phone number]

**Course Location Description for Dispatch**
- Course name: Veterans Memorial GC, Great Lakes Naval Base
- Address: [Course address]
- Main entrance: [Location]
- Alternative access: [Locations]
- Hole locations: Numbered 1-18 with cart path references

## Safety Requirements
- Trained personnel maintain current CPR/AED certification
- AED device accessible and functional
- First aid kit stocked and available
- Emergency phone numbers posted visibly
- Course personnel able to recognize medical emergencies

## Quality Standards
- Immediate response to medical emergency
- Appropriate first aid provided
- Emergency services contacted without delay
- Victim transported for professional care
- Incident thoroughly documented

## Documentation
- Incident report filed with date, time, location
- Nature of emergency and actions taken
- Emergency services response documented
- Victim outcome recorded (with permission)
- Training records current for all certified personnel
$$,
  'emergency',
  'sop',
  ARRAY['emergency', 'medical', 'first-aid', 'cpr', 'aed'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- SEASONAL SOPs (33-35)

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Spring Course Opening Procedure',
  $$# Spring Course Opening Procedure

## Purpose
To safely activate golf course operations for playing season, ensuring all systems functional, turf healthy, and course safe for play.

## Scope
All systems and areas of Veterans Memorial GC in preparation for spring playing season.

## Responsibilities
- Superintendent: Overall opening coordination and approval
- Greens Crew: Turf and green preparation
- Equipment Technician: Equipment startup and functionality
- Irrigation Manager: System activation and testing

## Procedure

### Pre-Opening Assessment (February-March)

**Turf Condition Assessment**
1. Walk entire course evaluating winter damage
2. Identify areas with snow mold or disease
3. Note winter kill or dead spots
4. Document any rodent damage
5. Assess soil conditions (waterlogged areas, compaction)
6. Document findings for treatment planning

**Facility Inspection**
1. Inspect for storm damage to structures
2. Check cart paths for surface damage, washouts
3. Inspect bridges and water features
4. Check signage for damage or need for repair
5. Assess drainage system functionality
6. Document repairs needed

**Equipment Assessment**
1. Check equipment stored for winter damage
2. Start equipment to verify functionality
3. Identify equipment needing repair
4. Plan maintenance schedule
5. Order any needed replacement parts

### Opening Preparation Tasks (4-6 weeks before opening)

**Drainage and Water Management**
1. Clean drainage system of leaves and debris
2. Verify proper water flow through systems
3. Inspect water features for debris
4. Clear clogged drains if needed
5. Assess water quality in course ponds
6. Plan for overflow/runoff management

**Disease and Pest Management**
1. Apply dormant oil spray if pest overwintering
2. Apply fungicide if snow mold evident
3. Assess for disease damage that requires intervention
4. Plan fertilizer applications for recovery
5. Scout for active disease/pest problems

**Turf Recovery Program**
1. Aerate compacted winter-damaged areas
2. Topdress severely damaged areas
3. Overseed thin or bare areas
4. Begin nitrogen fertilization for growth
5. Increase mowing frequency as growth increases
6. Monitor turf response to treatment

**Equipment Maintenance and Startup**
1. Perform pre-start inspection on all equipment
2. Change oil on all mowers and equipment
3. Replace air filters
4. Sharpen mower blades
5. Test all safety systems and controls
6. Fuel all equipment and verify operations

**Irrigation System Startup**
- Follow Irrigation System Startup (Spring) SOP
- Verify all zones functional
- Inspect for winter freeze damage
- Test controller and monitoring systems
- Calibrate soil moisture sensors

### 2 Weeks Before Opening

**Final Turf Preparation**
1. Final mowing (higher height to protect winter growth)
2. Final cleanup of debris (leaves, branches)
3. Verify no hazards visible on course
4. Final disease/pest assessment
5. Apply any remaining pre-opening treatments

**Facilities Final Prep**
1. Clean clubhouse and pro shop
2. Inspect all signage and repair if needed
3. Clean and stock restrooms
4. Verify lighting systems functional
5. Pressure wash pathways and carts
6. Clean bunkers completely

**Equipment Final Check**
1. Final pre-start inspection on all equipment
2. Replace any damaged parts
3. Verify all safety systems operational
4. Clean and polish equipment
5. Stock fuel tanks completely

**Administrative Preparation**
1. Update maintenance schedules
2. Review personnel assignments
3. Brief crew on season opening expectations
4. Verify safety training current
5. Update course records and documentation

### Opening Week (Days 1-5 Before Play Begins)

**Day 1: Final Site Walkthrough**
1. Superintendent walks entire course with crew leaders
2. Identify any final issues
3. Assign crews to priority areas
4. Brief on opening week schedule
5. Clarify expectations and quality standards

**Day 2-3: Final Course Preparation**
1. Mowing and turf grooming
2. Bunker raking and finishing
3. Tee box preparation and marker placement
4. Cart path cleaning and final inspection
5. Water feature inspection and cleanup

**Day 4: Soft Opening (Staff Only)**
1. Full course walk to verify playability
2. Test all course features
3. Staff plays course to check conditions
4. Identify any issues needing final correction
5. Make final adjustments before public play

**Day 5: Final Preparation**
1. Final turf mowing (optimal height of cut)
2. Final bunker grooming
3. Final cleanup of debris
4. Green speed check with Stimpmeter
5. Course marking (hole numbers, yardage signage)
6. Final staffing briefing and assignment

### Opening Day Procedures

**Early Morning (0400-0600)**
1. Irrigation completion if morning watering scheduled
2. Greens mowing and grooming
3. Tee box preparation
4. Final walkthrough for debris
5. Bunker final rake and level

**Pre-Play Inspection (0600-0700)**
1. Course walk-through for any overnight issues
2. Check water features for hazards
3. Verify signage in place and correct
4. Confirm cart paths clear
5. Final quality verification

**Play Opening (0700)**
1. First golfers tee off
2. Superintendent and crew on standby
3. Equipment ready for emergency repairs
4. Crew members monitor course during play
5. Address any issues immediately if found

### Post-Opening Monitoring (First Week)

**Daily Assessment**
1. Monitor course conditions daily
2. Adjust watering based on weather
3. Repair divots promptly
4. Address any turf stress observed
5. Monitor equipment for wear

**Crew Communication**
1. Daily briefing with opening week observations
2. Address any issues or concerns
3. Reinforce quality standards
4. Build team confidence for season
5. Celebrate successful opening

### Opening Documentation

**Pre-Opening Checklist**
1. Document completion of all prep tasks
2. Record equipment startup verification
3. Note any issues found and corrected
4. Document turf treatment applications
5. File all preparation records

**Opening Records**
1. Date of opening
2. Course condition at opening (photos helpful)
3. Crew assigned to opening tasks
4. Any issues encountered and resolution
5. First week observations

## Safety Requirements
- All equipment functionally safe before play begins
- Irrigation system safe and controlled
- Hazards identified and addressed
- Personnel trained and ready
- Emergency procedures in place

## Quality Standards
- All 18 holes playable and safe
- Turf in acceptable playing condition
- Equipment all functioning properly
- Greens at target speed
- Bunkers raked and prepared
- Course appearance professional

## Documentation
- Pre-opening assessment report
- Equipment startup log
- Irrigation startup verification
- Opening week weather and observations
- First week play observations
$$,
  'seasonal',
  'sop',
  ARRAY['seasonal', 'spring', 'opening', 'course-preparation'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Fall Course Winterization',
  $$# Fall Course Winterization

## Purpose
To prepare golf course for winter dormancy through turf hardening, equipment winterization, and facility preparation for cold season.

## Scope
All course systems and turf areas at Veterans Memorial GC in preparation for winter conditions.

## Responsibilities
- Superintendent: Winterization oversight and timing
- Greens Crew: Turf preparation and maintenance
- Equipment Technician: Equipment winterization
- Irrigation Manager: System shutdown

## Procedure

### Winterization Timeline

**Early Fall (August-September)**
- Transition fertilization program
- Begin dormancy preparations
- Monitor weather forecasts
- Plan winterization schedule

**Mid-Fall (September-October)**
- Intensive winter prep work
- Reduce irrigation
- Final turf treatments
- Equipment preparation

**Late Fall (October-November)**
- Final preparations
- System shutdown
- Course winterization completion
- Equipment storage

**First Frost Date (Anticipated: November 1)**
- Irrigation system shutdown
- Final mowing cycle
- Equipment storage begins

### Turf Winterization Program

**Late Summer Transition (August 15 - September 15)**

**Nitrogen Reduction**
1. Reduce nitrogen fertilizer applications
2. Lower clipping production = slower growth
3. Harder, denser turf more cold-hardy
4. Apply balanced or low-nitrogen fertilizer

**Potassium Increase**
1. Apply potassium fertilizer (higher K ratio)
2. Enhances cold hardiness
3. Promotes root development
4. Typical rate: 0.75-1.0 lbs K per 1,000 sq ft

**Aeration (If Needed)**
1. Light aeration to relieve compaction
2. Improves winter drainage
3. Promotes root development
4. Perform early September if needed

**Overseeding**
1. Overseed thin or bare areas
2. Cool-season grass germinates well in fall
3. Temporary ryegrass fills winter color
4. Seed mix: 100% perennial ryegrass or bentgrass blend

**Disease Management**
1. Monitor for fungal diseases
2. Apply preventive fungicide if history of issues
3. Reduce nitrogen (already reduced, helps prevent disease)
4. Improve drainage to reduce moisture

**Fall Maintenance (September 15 - October 31)**

**Mowing Adjustments**
1. Increase mowing height slightly (protect plants)
2. Final transition: From summer to dormant height
3. Reduce mowing frequency as growth slows
4. Final mow by October 31
5. Mowing heights:
   - Greens: 2.75 inches (raised from 2.5)
   - Fairways: 1.0 inches (raised from 0.75)
   - Roughs: 2.5 inches (raised from 2.0)
   - Tees: 1.25 inches (raised from 1.0)

**Cleanup Activities**
1. Rake fallen leaves regularly
2. Remove debris from bunkers
3. Clean plant beds of fallen material
4. Trim dead vegetation
5. Final cleanup by November 1

**Topdressing Program**
1. Light topdressing in September and October
2. Purpose: Fill divots, smooth surface
3. Application rate: 0.05-0.10 inch depth
4. Schedule before final mowing

**Irrigation Reduction**
1. Reduce watering frequency (rain increasing)
2. Monitor soil moisture
3. Reduce application as temperature drops
4. Cease irrigation by November 1

### Equipment Winterization

**Greens Mowers**
- Oil change (winter-grade oil if applicable)
- Air filter replacement
- Blade sharpening before storage
- Full fuel tank (prevents condensation)
- Battery tender connection if stored
- Stored indoors

**Fairway Mowers**
- Same as greens mowers
- Full fuel tank
- Hydraulic fluid check
- Battery tender if stored long-term

**All Equipment**
1. Clean thoroughly before storage
2. Remove grass and debris
3. Drain water from equipment if recommended
4. Fuel stabilizer in fuel tank
5. Battery charging or battery tender
6. Stored in dry location

**Detailed Winterization Steps:**
1. Perform full maintenance per Equipment Maintenance Schedule SOP
2. Change oil (winter-grade if applicable)
3. Replace or clean air filter
4. Replace fuel filter
5. Top off fuel tank completely
6. Add fuel stabilizer per manufacturer
7. Sharpen or replace blades
8. Check hydraulic fluid and top off
9. Inspect belts and hoses
10. Store in dry, sheltered location
11. Connect battery tender if applicable
12. Disconnect battery if long storage (no parasitic drain)

### Irrigation System Winterization

**Irrigation System Shutdown**
- Follow Irrigation System Winterization SOP
- Complete shutdown by November 1
- Verify all water drained from lines
- Protective valves in place
- System secured and protected

**Key Steps:**
1. Shut off main water supply
2. Open drain valves at low points
3. Purge system with compressed air (100 psi)
4. Close all zone valves
5. Winterize controller
6. Protect valve boxes
7. Document completion

### Facility Winterization

**Building Preparation**
1. Winterize outdoor water faucets (shut off supply, drain lines)
2. Disconnect hoses and store indoors
3. Seal any cracks or openings where wind enters
4. Check roof for damage or debris
5. Verify gutters and downspouts clear

**Parking Area and Roads**
1. Fill any potholes or washouts
2. Clear drainage areas
3. Remove debris
4. Prepare for snow removal operations

**Landscape Winterization**
1. Reduce watering to dormant requirements
2. Plant protection for tender plants
3. Apply mulch for root protection
4. Prune dead wood and weak branches
5. Prepare for snow/ice damage

### Personnel and Scheduling

**Crew Adjustments**
1. Reduce crew size if not operating full season
2. Reassign personnel to other duties
3. Plan winter maintenance projects
4. Maintain skill through cross-training

**Winter Maintenance Projects**
1. Equipment overhaul and repairs
2. Facility improvements
3. Facility painting or refurbishment
4. Course mapping and design planning
5. Staff training and development

**Planning Next Season**
1. Review previous season performance
2. Plan improvements for next season
3. Budget for capital projects
4. Order long-lead items
5. Schedule spring startup preparations

### Winterization Documentation

**Shutdown Checklist**
1. Equipment winterization completion
2. Irrigation system shutdown verification
3. Facility winterization status
4. Final turf condition assessment
5. Crew assignments and schedule

**Records and Filing**
1. Equipment maintenance records
2. Irrigation winterization documentation
3. Turf treatment records (fall program)
4. Final photographs of course condition
5. Maintenance plan for winter period

**Spring Startup Planning**
1. Note any issues observed in fall
2. Document equipment repairs needed
3. Plan spring startup timeline
4. Identify cost estimates for spring work
5. Schedule maintenance before spring opening

## Safety Requirements
- Equipment properly winterized (no fuel system issues)
- Drainage systems functional (prevent ice dams)
- Walkways and roads safe (prepare for snow/ice)
- Storage areas secure and organized

## Quality Standards
- All equipment clean and properly stored
- Irrigation system fully drained
- Facility ready for winter conditions
- Turf hardened for dormancy
- Documentation complete and organized

## Documentation
- Equipment winterization log with dates
- Irrigation shutdown checklist
- Final turf treatment and assessment
- Crew schedule for winter operations
- Spring startup planning checklist
$$,
  'seasonal',
  'sop',
  ARRAY['seasonal', 'fall', 'winterization', 'shutdown', 'preparation'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

INSERT INTO knowledge_articles (id, title, content, category, article_type, tags, version, is_published, linked_template_ids, attachments, created_by, updated_by, created_at, updated_at) VALUES (
  gen_random_uuid(),
  'Winter Equipment Storage & Maintenance',
  $$# Winter Equipment Storage & Maintenance

## Purpose
To store and maintain golf course equipment during winter dormancy, ensuring equipment ready for spring season and preventing deterioration.

## Scope
All motorized equipment stored during winter at Veterans Memorial GC.

## Responsibilities
- Equipment Technician: Storage and maintenance oversight
- Maintenance Crew: Equipment cleaning and preparation
- Superintendent: Inspection and equipment condition monitoring

## Procedure

### Pre-Storage Preparation (November)

**Equipment Assessment**
1. Evaluate each piece of equipment for condition
2. Identify repairs needed before storage
3. Prioritize critical repairs
4. Schedule maintenance work
5. Order replacement parts if needed

**Equipment Inspection and Cleaning**
1. Clean all equipment thoroughly:
   - Remove grass clippings from mower decks
   - Wash exterior to remove dirt and debris
   - Clean air intake areas
   - Dry completely before storage
2. Inspect for damage or wear:
   - Check blades/cutting edges
   - Inspect belts and hoses
   - Check fluid levels
   - Examine electrical connections
   - Document findings

**Maintenance Before Storage**
1. Final oil change (use winter-grade if applicable)
2. Replace air filter
3. Replace fuel filter
4. Check and top off all fluids
5. Sharpen or replace blades
6. Check tire pressure and condition
7. Inspect brake system
8. Test all controls and safety systems

### Storage Location Selection

**Primary Storage Building**
- Equipment shed with roof
- Protection from weather
- Secure and locked
- Temperature controlled if possible (prevents condensation)
- Adequate space for all equipment
- Good ventilation to prevent moisture buildup
- Concrete floor (not dirt) to prevent rust

**Storage Organization**
1. Organize equipment by type:
   - Mowers together
   - Sprayers and applicators grouped
   - Hand tools organized on racks
   - Small equipment shelved
2. Maintain clear pathways for access
3. Leave space for air circulation
4. Keep frequently-used items accessible

**Environmental Control**
1. Ensure building is dry
2. Dehumidifier if available (prevents rust)
3. Ventilation to prevent mold/mildew
4. Drain any standing water
5. Seal cracks and gaps

### Fuel System Management

**Fuel Tank Preparation**
1. Fill fuel tank completely before storage
   - Prevents moisture condensation in empty tank
   - Preserves fuel freshness
   - Less air space means less oxidation
2. Add fuel stabilizer per manufacturer:
   - Gasoline equipment: Standard fuel stabilizer
   - Diesel equipment: Diesel fuel supplement
   - Mix thoroughly by running engine briefly
3. Run engine for 5-10 minutes to circulate stabilized fuel

**Fuel Storage During Off-Season**
1. Keep fuel system sealed
2. Do not use equipment during storage period
3. Fuel remains stable with stabilizer for 12+ months
4. In spring: Run engine for 15-20 minutes to circulate fuel

### Battery Management

**Option 1: Battery Tender (Recommended)**
1. Leave battery connected
2. Connect battery tender (trickle charger)
3. Battery tender plugged in throughout winter
4. Maintains full charge without overcharging
5. Prevents battery discharge and sulfation
6. Battery ready for spring startup
7. Cost: $30-50 per tender

**Option 2: Battery Removal (Alternative)**
1. Remove battery from equipment
2. Store in cool, dry location
3. Prevent battery discharge:
   - Do not leave on concrete (drains battery)
   - Use wood shelf
   - Keep terminals clean and dry
4. Trickle charge monthly if possible
5. Reinstall before spring startup
6. Issue: Risk of forgotten battery

**Battery Service**
1. Clean terminals before storage:
   - Remove corrosion with baking soda and water
   - Dry thoroughly
2. Check water level (if not sealed battery)
3. Top off distilled water if needed
4. Ensure secure connection

### Engine and Mechanical Winterization

**Oil Change**
1. Change oil before storage (winter-grade if available)
2. Warm engine first
3. Drain completely
4. Replace drain plug
5. New filter with winter-grade oil
6. Top off to correct level

**Air Filter**
1. Replace air filter before storage
2. Do not reuse old filter
3. Use same filter type as manufacturer specs
4. Ensure proper fit and sealing

**Coolant System**
1. Check coolant level
2. Verify proper antifreeze concentration
3. Test with hydrometer if available
4. Top off with proper coolant if needed
5. Do not drain coolant (prevents rust)

**Hydraulic System**
1. Check hydraulic fluid level
2. Fluid should be amber color (not dark brown)
3. Top off if low with proper hydraulic fluid
4. Inspect hoses for cracks or leaks
5. Document any needed repairs

### Tire Management

**Tire Pressure**
1. Check tire pressure before storage
2. Inflate to normal operating pressure
3. Higher pressure acceptable for storage (prevents cracking)
4. Check again monthly if possible

**Tire Protection**
1. Clean tires before storage (removes contaminants)
2. If stored in sunlight: Cover with opaque material
3. Elevate equipment slightly if long-term storage (prevents flat spots)
4. Inspect for damage before storage

**Tire Repair**
1. Repair any punctures before storage
2. Replace worn tires if near end of life
3. Do not store equipment with low or flat tires
4. Verify tires hold pressure throughout winter

### Protection from Corrosion and Rust

**Lubrication Program**
1. Lubricate all pivot points and hinges
2. Use multi-purpose grease
3. Wipe off excess
4. Check hinges for smooth operation
5. Apply to: Blade adjustment mechanisms, wheel bearings, latches

**Undercarriage Protection**
1. Spray undercarriage with light oil (prevents rust)
2. Pay special attention to exposed metal
3. Do not use heavy oil (collects dirt)
4. Light coating of penetrating oil sufficient
5. Prevents moisture from contacting bare metal

**Electrical Connector Protection**
1. Inspect electrical connections
2. Clean any corrosion
3. Spray with moisture-displacing spray
4. Verify connections tight
5. Tape any open connectors

**Metal Surface Protection**
1. Wipe dry any wet areas
2. Small rust spots: Clean and apply rust converter
3. Paint nicks/chips: Touch up with paint
4. Wax any painted surfaces if desired
5. Prevents corrosion during storage

### Covers and Tarps

**Equipment Covering**
1. Covers protect from dust and debris
2. Use breathable material (prevents moisture trap)
3. Do not use plastic tarp (traps moisture)
4. Ensure cover secure (prevents shifting)
5. Allows air circulation underneath

**Blade and Cutting Edge Protection**
1. Sharpen blades before storage (prevents rust)
2. Apply light oil to blade edges
3. Wipe off excess
4. Sharp edges easier to maintain in spring
5. Prevent dulling and corrosion

### Monthly Inspection During Storage

**Monthly Walkthrough**
1. Visual inspection of all equipment
2. Check for signs of moisture or condensation
3. Verify covers secure and intact
4. Check battery tender status (if used)
5. Inspect for pest damage or nesting

**Condition Monitoring**
1. Look for rust or corrosion developing
2. Check for rodent damage
3. Verify battery connections secure
4. Ensure equipment hasn't shifted or toppled
5. Spot any fluid leaks

**Maintenance Items**
1. Check battery tender is plugged in and functioning
2. Verify building secure and dry
3. Address any moisture issues
4. Sweep area to prevent pest nesting
5. Repair any damage found

### Spring Preparation (March-April)

**Pre-Season Startup Preparation**
1. Schedule equipment for final pre-season inspection
2. Address any maintenance identified during storage
3. Test battery charge (should be fully charged)
4. Run brief engine test before full service
5. Check all systems for functionality

**Spring Startup**
- Follow Daily Equipment Inspection & Pre-Start Checklist SOP
- Follow Equipment Maintenance Schedule SOP
- Test all equipment before course use
- Address any issues found before deployment

### Documentation and Record Keeping

**Storage Inventory**
1. Maintain list of all equipment in storage
2. Record storage location
3. Note condition at storage time
4. Document any repairs made before storage
5. Update as equipment moved or replaced

**Storage Maintenance Log**
1. Record monthly inspection findings
2. Document any maintenance performed during storage
3. Note environmental conditions (temperature, humidity)
4. Record battery tender status
5. Document any issues or concerns

**Pre-Season Service Records**
1. Spring startup inspection results
2. Any repairs performed before spring use
3. Equipment test results
4. Approval for course deployment
5. Equipment maintenance schedule for season

## Safety Requirements
- Equipment secure and stable during storage
- No fuel or fluid leaks into building
- Building secure and weathertight
- No pest or wildlife access
- Fire extinguisher available in storage area

## Quality Standards
- Equipment clean and dry before storage
- All fluids topped off and stabilized
- No visible corrosion or damage
- All systems functional before deployment
- Documentation complete and organized

## Documentation
- Maintain storage inventory list
- Record monthly inspection findings
- File all maintenance work completed
- Document equipment condition at storage
- Keep spring startup checklist
$$,
  'seasonal',
  'sop',
  ARRAY['seasonal', 'winter', 'equipment-storage', 'maintenance', 'preservation'],
  1,
  true,
  '{}',
  '[]',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  '3dfa2538-7008-4c23-8734-24c0ff7c94e4',
  now(),
  now()
);

-- Final statement to indicate completion
-- All 35 SOPs inserted successfully
