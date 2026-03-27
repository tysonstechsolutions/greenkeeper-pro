# GreenKeeper Pro Testing Checklist

This document provides a comprehensive testing checklist for GreenKeeper Pro's PWA functionality, browser compatibility, responsive design, and performance. Use this checklist before each release to ensure quality and reliability.

---

## 1. PWA Installation Testing

### iOS Safari (iPhone/iPad)

**Prerequisites:**
- Test device running iOS 16+
- Safari browser (default)
- HTTPS connection (required for PWA)

**Installation Steps:**

1. **Navigate to App**
   - [ ] Open Safari and navigate to the production URL
   - [ ] Verify the page loads correctly
   - [ ] Check that the address bar shows the correct URL

2. **Install PWA**
   - [ ] Tap the Share button (square with arrow pointing up)
   - [ ] Scroll and tap "Add to Home Screen"
   - [ ] Verify the app icon preview shows correctly
   - [ ] Verify the app name displays as "GreenKeeper Pro"
   - [ ] Tap "Add" in the top right

3. **Verify Installation**
   - [ ] Confirm icon appears on home screen with correct branding
   - [ ] Icon shows GK PRO logo (green background, gold letters)
   - [ ] Tap icon to launch app
   - [ ] App opens in standalone mode (no browser UI)
   - [ ] Status bar shows as black-translucent
   - [ ] Safe area insets are properly respected (notch/island)
   - [ ] Bottom navigation is visible and accessible

4. **App Behavior**
   - [ ] Portrait orientation is enforced (no landscape rotation)
   - [ ] Theme color (#1B4332 green) appears in status bar
   - [ ] App shortcuts work from home screen (long press icon)
   - [ ] Verify shortcuts: Tasks, Messages, Take Photo
   - [ ] Test app launch from each shortcut

### Android Chrome

**Prerequisites:**
- Test device running Android 8.0+
- Chrome browser (latest version)
- HTTPS connection

**Installation Steps:**

1. **Navigate to App**
   - [ ] Open Chrome and navigate to the production URL
   - [ ] Verify the page loads correctly

2. **Install PWA**
   - [ ] Look for "Add to Home screen" banner at bottom
   - [ ] If banner doesn't appear, tap menu (3 dots) → "Add to Home screen"
   - [ ] Verify install prompt shows app name and icon
   - [ ] Tap "Add" or "Install"

3. **Verify Installation**
   - [ ] App icon appears on home screen
   - [ ] Icon displays correctly without Chrome browser badge
   - [ ] Tap icon to launch
   - [ ] App opens in standalone mode (no Chrome UI)
   - [ ] Theme color (#1B4332) appears in top bar
   - [ ] Navigation is accessible

4. **App Behavior**
   - [ ] Portrait orientation preference is maintained
   - [ ] Back button returns to last app (not browser history)
   - [ ] App shortcuts work (long press icon)
   - [ ] Test each shortcut navigation

5. **Advanced Android Testing**
   - [ ] Check Settings → Apps → GreenKeeper Pro shows as "Installed app"
   - [ ] Verify storage permissions are granted
   - [ ] Test notification permissions (if applicable)
   - [ ] Verify app appears in recent apps list correctly

### Desktop PWA Installation

#### Chrome/Edge (Chromium-based)

1. **Install**
   - [ ] Navigate to production URL in Chrome/Edge
   - [ ] Look for install icon in address bar (monitor with down arrow)
   - [ ] Click install icon or menu → "Install GreenKeeper Pro"
   - [ ] Confirm installation dialog

2. **Verify**
   - [ ] App opens in standalone window (no browser tabs/address bar)
   - [ ] Window title shows "GreenKeeper Pro"
   - [ ] App icon appears in taskbar/dock
   - [ ] App icon appears in Start Menu/Applications folder
   - [ ] Theme color applies to window frame

3. **Test**
   - [ ] Close and reopen from Start Menu/Applications
   - [ ] Test window resize behavior
   - [ ] Verify responsive breakpoints work correctly
   - [ ] Test keyboard shortcuts (Ctrl+W to close, etc.)
   - [ ] Verify app can be uninstalled from OS settings

### Manifest Validation

**Automated Checks:**

1. **Manifest File Validation**
   - [ ] Navigate to `/manifest.json`
   - [ ] Verify JSON is valid and properly formatted
   - [ ] Confirm all required fields present:
     - `name`: "GreenKeeper Pro"
     - `short_name`: "GreenKeeper"
     - `start_url`: "/"
     - `display`: "standalone"
     - `theme_color`: "#1B4332"
     - `background_color`: "#1B4332"
     - `icons`: Contains 192x192 and 512x512

2. **Chrome DevTools Check**
   - [ ] Open Chrome DevTools (F12)
   - [ ] Go to Application tab → Manifest
   - [ ] Verify all manifest properties display correctly
   - [ ] Check "Identity" section shows app name
   - [ ] Check "Presentation" shows standalone mode
   - [ ] Verify icons preview correctly (both PNG and SVG)
   - [ ] Confirm shortcuts are listed (Tasks, Messages, Take Photo)

3. **Icon Validation**
   - [ ] Verify icons exist in `/public/icons/`:
     - `icon-192.png` (192x192 - required)
     - `icon-512.png` (512x512 - required)
     - `icon-192x192.svg`, `icon-512x512.svg` (vector alternatives)
     - `apple-touch-icon.svg` (iOS 180x180)
   - [ ] Test icon purposes: "any" and "maskable"
   - [ ] Verify maskable icons work on Android (icon stays within safe zone)

4. **Service Worker Check**
   - [ ] DevTools → Application → Service Workers
   - [ ] Verify SW is registered and activated
   - [ ] Status shows "activated and is running"
   - [ ] Source shows `/sw.js`
   - [ ] Check "Update on reload" during testing
   - [ ] Test "Unregister" and "Update" buttons work

---

## 2. Offline Functionality Testing

### Offline Page Display

1. **Initial Test**
   - [ ] With internet connection, navigate to any page
   - [ ] Open DevTools → Network tab
   - [ ] Check "Offline" checkbox to simulate offline
   - [ ] Try to navigate to a new page
   - [ ] Verify offline page (`/offline`) displays correctly

2. **Offline Page Content Verification**
   - [ ] GK PRO logo displays at top
   - [ ] WiFi Off icon shows prominently
   - [ ] Heading: "You're Offline"
   - [ ] Description text explains situation
   - [ ] "What you can still do" section lists:
     - Update Task Status (changes sync when back online)
     - Take Photos (photos saved for upload later)
     - Draft Messages (messages queued for sending)
     - View Cached Data (recently viewed pages available)
   - [ ] "Try Again" button is visible and functional
   - [ ] Tip text shows at bottom

3. **Offline Styling**
   - [ ] Page matches app theme
   - [ ] Icons use correct colors (green, blue, purple, orange)
   - [ ] Layout is responsive on all screen sizes
   - [ ] Dark mode support (if implemented)

### Offline Queue for Data Mutations

**Note:** GreenKeeper Pro uses Serwist with NetworkFirst caching strategy. Test these scenarios:

1. **Task Status Updates**
   - [ ] Go online and navigate to Tasks page
   - [ ] Wait for page to load and cache
   - [ ] Go offline (DevTools → Network → Offline)
   - [ ] Attempt to update a task status
   - [ ] Verify UI shows pending/queued state (if implemented)
   - [ ] Return online
   - [ ] Verify update synchronizes automatically
   - [ ] Check task status updated in database

2. **Photo Capture**
   - [ ] Navigate to Photos page while online
   - [ ] Go offline
   - [ ] Take a photo using camera
   - [ ] Verify photo is stored locally
   - [ ] Return online
   - [ ] Verify photo uploads automatically
   - [ ] Check photo appears in gallery

3. **Message Draft**
   - [ ] Navigate to Messages while online
   - [ ] Go offline
   - [ ] Compose a new message
   - [ ] Submit message
   - [ ] Verify message is queued (if implemented)
   - [ ] Return online
   - [ ] Verify message sends automatically

### Cache Fallback Testing

1. **API Response Cache**
   - [ ] Navigate to Dashboard while online
   - [ ] Verify data loads from network
   - [ ] Go offline
   - [ ] Refresh page (F5)
   - [ ] Verify cached data displays (up to 24 hours old)
   - [ ] Check Supabase requests use cached data (up to 1 hour old)

2. **Image Cache**
   - [ ] View Equipment page with equipment images while online
   - [ ] Go offline
   - [ ] Navigate to same equipment
   - [ ] Verify images load from cache (up to 7 days old)

3. **App Shell Cache**
   - [ ] Load any page while online
   - [ ] Go offline
   - [ ] Navigate between pages
   - [ ] Verify CSS, JavaScript, and fonts load from cache (up to 30 days)

### Sync on Reconnect

1. **Automatic Reconnection**
   - [ ] Go offline during active session
   - [ ] Make offline changes (task updates, photos, etc.)
   - [ ] Return online
   - [ ] Verify app detects connection automatically
   - [ ] Check pending changes sync without page refresh
   - [ ] Verify no data loss occurred

2. **Manual Retry**
   - [ ] Trigger offline page
   - [ ] Click "Try Again" button
   - [ ] Verify page attempts to reload
   - [ ] If still offline, offline page shows again
   - [ ] If online, normal page loads

### Features: Online vs Offline

**Should Work Offline:**
- [ ] View cached tasks, equipment, chemicals data
- [ ] Update task status (queued for sync)
- [ ] Take photos (stored locally)
- [ ] Draft messages (queued for sending)
- [ ] View previously loaded pages
- [ ] Navigate between cached routes
- [ ] Access app shell (navigation, layout)

**Requires Connection:**
- [ ] Creating new tasks
- [ ] Creating new equipment entries
- [ ] Chemical application logging
- [ ] Viewing real-time data updates
- [ ] User authentication/login
- [ ] Loading new pages not previously visited
- [ ] Accessing external links
- [ ] Uploading photos/files
- [ ] Sending messages

---

## 3. Browser Compatibility Matrix

Test on the following browsers and document any issues:

### Desktop Browsers

#### Chrome (Latest 2 Versions)

**Test Versions:** Chrome 130, Chrome 129

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] All pages render correctly
  - [ ] Navigation works smoothly
  - [ ] Forms submit successfully
  - [ ] Images load and display

- [ ] **PWA Features**
  - [ ] Install prompt appears
  - [ ] Service Worker registers
  - [ ] Offline mode works
  - [ ] Push notifications (if applicable)

- [ ] **Performance**
  - [ ] Page load time < 3 seconds
  - [ ] Smooth scrolling and animations
  - [ ] No console errors or warnings

#### Safari (Latest 2 Versions)

**Test Versions:** Safari 18, Safari 17

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] All pages render correctly (check flexbox, grid)
  - [ ] Navigation works smoothly
  - [ ] Forms submit successfully
  - [ ] Date pickers work (native iOS behavior)
  - [ ] Images load and display

- [ ] **PWA Features**
  - [ ] Add to Home Screen works
  - [ ] Service Worker registers (check for Safari-specific issues)
  - [ ] Offline mode works
  - [ ] Meta tags for apple-mobile-web-app work

- [ ] **Safari-Specific Checks**
  - [ ] Check CSS with `-webkit-` prefixes
  - [ ] Test backdrop-filter effects
  - [ ] Verify position: sticky works
  - [ ] Check vh units with safe-area-inset

#### Firefox (Latest 2 Versions)

**Test Versions:** Firefox 131, Firefox 130

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] All pages render correctly
  - [ ] Navigation works smoothly
  - [ ] Forms submit successfully
  - [ ] Images load and display

- [ ] **PWA Features**
  - [ ] Service Worker registers
  - [ ] Offline mode works
  - [ ] Manifest recognized (Firefox has limited PWA support)

- [ ] **Firefox-Specific Checks**
  - [ ] Test with Enhanced Tracking Protection enabled
  - [ ] Verify WebP image support
  - [ ] Check flexbox behavior

#### Edge (Latest 2 Versions)

**Test Versions:** Edge 130, Edge 129

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] All pages render correctly
  - [ ] Navigation works smoothly
  - [ ] Forms submit successfully
  - [ ] Images load and display

- [ ] **PWA Features**
  - [ ] Install prompt appears (similar to Chrome)
  - [ ] Service Worker registers
  - [ ] Offline mode works
  - [ ] Desktop integration works

### Mobile Browsers

#### iOS Safari

**Test Versions:** iOS 17+ Safari, iOS 16+ Safari

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] Touch interactions work smoothly
  - [ ] Swipe gestures don't interfere with app
  - [ ] Form inputs work (no zoom on focus)
  - [ ] Select dropdowns work
  - [ ] Date/time pickers use native iOS UI

- [ ] **PWA Features**
  - [ ] Add to Home Screen creates icon
  - [ ] App launches in standalone mode
  - [ ] Status bar styling applies (black-translucent)
  - [ ] Safe area insets respected (notch, Dynamic Island)
  - [ ] No browser chrome visible
  - [ ] App shortcuts work

- [ ] **iOS-Specific Checks**
  - [ ] Test on iPhone with notch (12, 13, 14, 15)
  - [ ] Test on iPhone with Dynamic Island (14 Pro, 15 Pro)
  - [ ] Test on iPhone SE (no notch)
  - [ ] Test on iPad (different safe areas)
  - [ ] Verify landscape mode (if supported)
  - [ ] Check bottom navigation doesn't overlap home indicator

#### Android Chrome

**Test Versions:** Android 13+ Chrome, Android 12+ Chrome

- [ ] **Core Functionality**
  - [ ] App loads without errors
  - [ ] Touch interactions work smoothly
  - [ ] Swipe gestures work correctly
  - [ ] Form inputs work (keyboard doesn't break layout)
  - [ ] Select dropdowns work
  - [ ] Date/time pickers use native Android UI

- [ ] **PWA Features**
  - [ ] Install banner appears
  - [ ] Add to Home Screen creates icon
  - [ ] App launches in standalone mode
  - [ ] Theme color applies to status bar
  - [ ] No browser chrome visible
  - [ ] App shortcuts work

- [ ] **Android-Specific Checks**
  - [ ] Test on different screen sizes (small, medium, large)
  - [ ] Test with Android system gestures enabled
  - [ ] Verify back button behavior
  - [ ] Check notification permission prompt (if applicable)

### Compatibility Testing Tools

**Automated Tools:**
- [ ] Run [Can I Use](https://caniuse.com/) checks for key features:
  - Service Workers
  - Web App Manifest
  - CSS Grid
  - CSS Flexbox
  - WebP images
  - ES6+ JavaScript features

**Manual Testing Services:**
- [ ] Use BrowserStack or similar for cross-browser testing
- [ ] Test on real devices when possible (more accurate than simulators)

---

## 4. Responsive Design Testing

Test the following viewport sizes and document any layout issues:

### Mobile Viewport (320px - 480px)

**Test Dimensions:**
- [ ] 320px (iPhone SE)
- [ ] 375px (iPhone 12/13/14)
- [ ] 390px (iPhone 14 Pro)
- [ ] 430px (iPhone 14 Pro Max)

**Key Pages to Test:**

#### Dashboard
- [ ] Navigation bar is fixed and accessible
- [ ] Cards stack vertically
- [ ] Text is readable without horizontal scroll
- [ ] Buttons are easily tappable (min 44px touch target)
- [ ] Charts/graphs adapt to narrow width
- [ ] No content overflow

#### Tasks Page
- [ ] Task list displays in single column
- [ ] Task cards are properly sized
- [ ] Status badges are visible
- [ ] Action buttons accessible
- [ ] Filters/sorting UI works on small screen
- [ ] "Add Task" button accessible

#### Task Detail/Edit
- [ ] Form fields stack vertically
- [ ] Input fields are full width
- [ ] Labels are clearly visible
- [ ] Date/time picker works on mobile
- [ ] Select dropdowns don't overflow
- [ ] Save/cancel buttons accessible

#### Equipment Page
- [ ] Equipment cards stack in single column
- [ ] Images scale appropriately
- [ ] Equipment details readable
- [ ] Action buttons accessible

#### Chemicals Page
- [ ] Chemical list displays clearly
- [ ] Application history is readable
- [ ] "Apply Chemical" button accessible
- [ ] Chemical details don't overflow

#### Messages Page
- [ ] Message list fits in viewport
- [ ] Message preview text truncates properly
- [ ] Compose button accessible
- [ ] Message detail view works

### Tablet Viewport (768px - 1024px)

**Test Dimensions:**
- [ ] 768px (iPad Mini, portrait)
- [ ] 820px (iPad Air, portrait)
- [ ] 1024px (iPad Pro, landscape)

**Key Pages to Test:**

#### Dashboard
- [ ] Layout uses 2-column grid where appropriate
- [ ] Cards have optimal width (not too wide)
- [ ] Charts/graphs show more detail
- [ ] Navigation remains accessible
- [ ] Whitespace is balanced

#### Tasks Page
- [ ] Tasks display in 2-column grid or list
- [ ] Filters/sorting in header row
- [ ] Task cards have good proportions
- [ ] No excessive whitespace

#### Forms (Task/Equipment/Chemical)
- [ ] Form fields use 2-column layout where logical
- [ ] Input fields have appropriate max-width
- [ ] Multi-column layout for related fields
- [ ] Form doesn't look stretched

#### Equipment/Chemicals
- [ ] Items display in 2-column grid
- [ ] Cards are properly sized
- [ ] Images have good proportions
- [ ] Detail views use available space well

### Desktop Viewport (1280px+)

**Test Dimensions:**
- [ ] 1280px (HD)
- [ ] 1440px (MacBook Pro)
- [ ] 1920px (Full HD)
- [ ] 2560px (4K)

**Key Pages to Test:**

#### Dashboard
- [ ] Layout uses 3-4 column grid
- [ ] Content is centered with max-width constraint
- [ ] Charts/graphs use available space
- [ ] No excessive whitespace
- [ ] Navigation scales appropriately

#### Tasks Page
- [ ] Tasks display in multi-column grid or table
- [ ] Filters/sorting in dedicated toolbar
- [ ] Task cards have max-width (don't stretch too wide)
- [ ] Good use of horizontal space

#### Forms
- [ ] Forms are centered with max-width (e.g., 800px)
- [ ] Multi-column layout for efficiency
- [ ] Adequate whitespace between fields
- [ ] Buttons aligned logically

#### Equipment/Chemicals
- [ ] Items display in 3-4 column grid
- [ ] Cards have max-width to prevent stretching
- [ ] Detail views use sidebar layout (if applicable)
- [ ] Tables are responsive and scrollable if needed

### General Responsive Checks (All Breakpoints)

- [ ] **Typography**
  - Headings scale appropriately
  - Body text is readable (16px+ on mobile)
  - Line height is comfortable (1.5-1.6)
  - No text overflow or truncation issues

- [ ] **Images**
  - Images scale proportionally
  - No pixelation or distortion
  - Lazy loading works
  - Alt text present for accessibility

- [ ] **Navigation**
  - Bottom navigation works on mobile
  - Sidebar navigation works on tablet/desktop (if applicable)
  - Menu icon (hamburger) works on mobile
  - Active page indicator visible

- [ ] **Touch Targets**
  - All interactive elements min 44x44px on mobile
  - Adequate spacing between touch targets
  - Hover states work on desktop
  - Active states work on mobile

- [ ] **Modals/Dialogs**
  - Center on screen at all sizes
  - Don't exceed viewport height
  - Scrollable content if needed
  - Close button accessible

- [ ] **Tables**
  - Horizontal scroll on mobile if needed
  - Card layout on mobile (if appropriate)
  - Sticky headers (if applicable)
  - Readable on all screen sizes

### Testing Tools

**Browser DevTools:**
- [ ] Chrome DevTools Device Toolbar (Cmd/Ctrl + Shift + M)
- [ ] Test with "Responsive" mode
- [ ] Test specific device presets

**Real Device Testing:**
- [ ] Test on actual mobile devices (iOS and Android)
- [ ] Test on actual tablets
- [ ] Test on various desktop screen sizes

**Automated Tools:**
- [ ] Run Lighthouse mobile test
- [ ] Use BrowserStack Responsive tool
- [ ] Test with Responsively App

---

## 5. Performance Testing

### Lighthouse Audit Targets

Run Lighthouse audits (Chrome DevTools → Lighthouse) for both mobile and desktop:

#### Performance Score Target: 90+

**Mobile:**
- [ ] Overall Performance Score ≥ 90
- [ ] First Contentful Paint (FCP) ≤ 1.8s
- [ ] Largest Contentful Paint (LCP) ≤ 2.5s
- [ ] Time to Interactive (TTI) ≤ 3.8s
- [ ] Speed Index ≤ 3.4s
- [ ] Total Blocking Time (TBT) ≤ 200ms
- [ ] Cumulative Layout Shift (CLS) ≤ 0.1

**Desktop:**
- [ ] Overall Performance Score ≥ 95
- [ ] First Contentful Paint (FCP) ≤ 0.9s
- [ ] Largest Contentful Paint (LCP) ≤ 1.2s
- [ ] Time to Interactive (TTI) ≤ 2.5s
- [ ] Speed Index ≤ 1.3s
- [ ] Total Blocking Time (TBT) ≤ 150ms
- [ ] Cumulative Layout Shift (CLS) ≤ 0.1

#### Accessibility Score Target: 95+

- [ ] Overall Accessibility Score ≥ 95
- [ ] All images have alt text
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Sufficient color contrast (min 4.5:1 for text)
- [ ] Form inputs have labels
- [ ] Links have descriptive text
- [ ] ARIA attributes used correctly
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] No automatic audio playback

#### Best Practices Score Target: 95+

- [ ] Overall Best Practices Score ≥ 95
- [ ] HTTPS used
- [ ] No browser errors in console
- [ ] Images use correct aspect ratio
- [ ] Images use appropriate formats (WebP)
- [ ] No deprecated APIs used
- [ ] Permissions requested at appropriate time
- [ ] Geolocation/notifications have user gesture

#### SEO Score Target: 90+

- [ ] Overall SEO Score ≥ 90
- [ ] Page has meta description
- [ ] Document has title
- [ ] Links are crawlable
- [ ] Viewport meta tag present
- [ ] Font sizes are legible
- [ ] Tap targets are sized appropriately

#### PWA Score Target: 100

- [ ] Installable (manifest and service worker)
- [ ] Service worker controls page and start_url
- [ ] Redirects HTTP to HTTPS
- [ ] Configured for custom splash screen
- [ ] Sets theme color
- [ ] Content sized correctly for viewport
- [ ] Has maskable icon

### Core Web Vitals Targets

**Field Data (Real User Monitoring):**

Test with real users or use Chrome User Experience Report:

- [ ] **Largest Contentful Paint (LCP) ≤ 2.5s**
  - Measures loading performance
  - Test on Dashboard, Tasks, Equipment pages
  - Optimize images, fonts, and critical resources

- [ ] **First Input Delay (FID) ≤ 100ms**
  - Measures interactivity
  - Test clicking buttons, opening modals
  - Optimize JavaScript execution
  - Use code splitting and lazy loading

- [ ] **Cumulative Layout Shift (CLS) ≤ 0.1**
  - Measures visual stability
  - Check for layout shifts during page load
  - Reserve space for images, ads, embeds
  - Avoid inserting content above existing content

**Testing Methods:**

1. **Chrome DevTools:**
   - [ ] Open DevTools → Performance tab
   - [ ] Record page load
   - [ ] Check Web Vitals in Experience section

2. **PageSpeed Insights:**
   - [ ] Test production URL at [PageSpeed Insights](https://pagespeed.web.dev/)
   - [ ] Review Field Data and Lab Data
   - [ ] Follow optimization suggestions

3. **Chrome UX Report:**
   - [ ] View CrUX data in Search Console
   - [ ] Check percentile distributions (P75)
   - [ ] Monitor trends over time

### Network Throttling Tests

Simulate slower network conditions to ensure app performs well for all users:

#### 3G Network (Fast 3G)

**Settings:** 1.6 Mbps download, 750 Kbps upload, 150ms latency

- [ ] Open DevTools → Network tab
- [ ] Set throttling to "Fast 3G"
- [ ] Test key pages:
  - [ ] Dashboard loads within 5 seconds
  - [ ] Tasks page loads within 4 seconds
  - [ ] Images load progressively (blur-up or skeleton)
  - [ ] App remains interactive during load
  - [ ] No timeout errors

#### Slow 3G Network

**Settings:** 400 Kbps download, 400 Kbps upload, 400ms latency

- [ ] Set throttling to "Slow 3G"
- [ ] Test key pages:
  - [ ] Dashboard loads within 10 seconds
  - [ ] Loading indicators shown during load
  - [ ] Critical content loads first (above the fold)
  - [ ] Images lazy load
  - [ ] App doesn't crash or hang
  - [ ] Offline mode engages if connection drops

#### Offline

- [ ] Set throttling to "Offline"
- [ ] Verify offline page displays
- [ ] Test cached page navigation
- [ ] Verify service worker fallback strategies work

### Performance Optimization Checklist

**Before Each Release:**

- [ ] Run Lighthouse audit on staging
- [ ] Check bundle size (use `npm run build`)
- [ ] Verify code splitting is working
- [ ] Review network waterfall for bottlenecks
- [ ] Optimize images (use WebP, proper sizing)
- [ ] Minimize render-blocking resources
- [ ] Enable text compression (Gzip/Brotli)
- [ ] Implement resource hints (preconnect, prefetch)
- [ ] Verify service worker caching strategies
- [ ] Test on slow network (3G throttling)
- [ ] Monitor Core Web Vitals in production

---

## 6. Manual Testing Procedures

### Authentication Flow

#### New User Registration

1. **Navigate to Registration**
   - [ ] Go to login page
   - [ ] Click "Sign up" or "Create account"
   - [ ] Verify registration form displays

2. **Fill Registration Form**
   - [ ] Enter email address
   - [ ] Enter password (check strength indicator)
   - [ ] Confirm password
   - [ ] Accept terms of service (if applicable)
   - [ ] Click "Create Account"

3. **Email Verification**
   - [ ] Check for verification email
   - [ ] Click verification link
   - [ ] Verify redirects to app
   - [ ] Confirm account is active

4. **First Login**
   - [ ] Enter credentials
   - [ ] Click "Sign In"
   - [ ] Verify redirects to dashboard
   - [ ] Check welcome message or onboarding

5. **Error Handling**
   - [ ] Try weak password → error shown
   - [ ] Try existing email → error shown
   - [ ] Try mismatched passwords → error shown
   - [ ] Try invalid email format → error shown

#### Existing User Login

1. **Navigate to Login**
   - [ ] Go to login page
   - [ ] Verify login form displays

2. **Login with Credentials**
   - [ ] Enter email
   - [ ] Enter password
   - [ ] Click "Sign In"
   - [ ] Verify redirects to dashboard

3. **Remember Me (if applicable)**
   - [ ] Check "Remember me" option
   - [ ] Login successfully
   - [ ] Close browser
   - [ ] Reopen and verify still logged in

4. **Error Handling**
   - [ ] Try wrong password → error shown
   - [ ] Try non-existent email → error shown
   - [ ] Try empty fields → validation errors shown

#### Password Reset

1. **Initiate Reset**
   - [ ] Click "Forgot password?"
   - [ ] Enter email address
   - [ ] Click "Send reset link"
   - [ ] Verify confirmation message

2. **Reset Password**
   - [ ] Check email for reset link
   - [ ] Click reset link
   - [ ] Enter new password
   - [ ] Confirm new password
   - [ ] Click "Reset password"
   - [ ] Verify success message

3. **Login with New Password**
   - [ ] Go to login page
   - [ ] Enter email and new password
   - [ ] Verify login successful

#### Logout

1. **Logout**
   - [ ] Click user menu/avatar
   - [ ] Click "Logout" or "Sign Out"
   - [ ] Verify redirects to login page
   - [ ] Verify cannot access protected pages
   - [ ] Verify session is cleared

### Task Creation Flow

#### Create New Task

1. **Navigate to Task Creation**
   - [ ] Click "Tasks" in navigation
   - [ ] Click "Add Task" or "+" button
   - [ ] Verify task creation form displays

2. **Fill Task Form**
   - [ ] Enter task title (required)
   - [ ] Select task category/type (dropdown)
   - [ ] Select priority (Low/Medium/High)
   - [ ] Select assigned crew member(s)
   - [ ] Set due date (date picker)
   - [ ] Set due time (time picker)
   - [ ] Select course area (dropdown or map)
   - [ ] Enter description/notes (textarea)
   - [ ] Add attachments/photos (if applicable)

3. **Save Task**
   - [ ] Click "Create Task" or "Save"
   - [ ] Verify success message displays
   - [ ] Verify redirects to task list or task detail
   - [ ] Confirm new task appears in list

4. **Validation Testing**
   - [ ] Try submitting with empty title → error shown
   - [ ] Try selecting past due date → warning shown (if applicable)
   - [ ] Try submitting without required fields → errors shown
   - [ ] Verify character limits on text fields

#### Edit Existing Task

1. **Navigate to Task**
   - [ ] Find task in task list
   - [ ] Click task to view details
   - [ ] Click "Edit" button

2. **Update Task**
   - [ ] Change task title
   - [ ] Update priority
   - [ ] Change assigned crew member
   - [ ] Update due date/time
   - [ ] Modify description
   - [ ] Click "Save Changes"

3. **Verify Updates**
   - [ ] Verify success message
   - [ ] Confirm changes reflected in task list
   - [ ] Check task detail shows updated info
   - [ ] Verify history/audit log (if applicable)

#### Update Task Status

1. **Mark Task In Progress**
   - [ ] Click task in list
   - [ ] Click "Start" or change status to "In Progress"
   - [ ] Verify status badge updates
   - [ ] Confirm timestamp recorded

2. **Mark Task Complete**
   - [ ] Click "Complete" or change status to "Completed"
   - [ ] Add completion notes (if prompted)
   - [ ] Upload completion photo (if applicable)
   - [ ] Verify task moves to completed section
   - [ ] Check completion timestamp

3. **Reopen Task**
   - [ ] Find completed task
   - [ ] Click "Reopen" or change status to "In Progress"
   - [ ] Verify task returns to active list

#### Delete Task

1. **Delete Task**
   - [ ] Navigate to task detail
   - [ ] Click "Delete" button
   - [ ] Verify confirmation dialog appears
   - [ ] Confirm deletion
   - [ ] Verify task removed from list
   - [ ] Check task is not accessible via direct URL

### Equipment Management Flow

#### Add New Equipment

1. **Navigate to Equipment**
   - [ ] Click "Equipment" in navigation
   - [ ] Click "Add Equipment" or "+" button
   - [ ] Verify equipment form displays

2. **Fill Equipment Form**
   - [ ] Enter equipment name (required)
   - [ ] Select equipment type/category
   - [ ] Enter manufacturer
   - [ ] Enter model number
   - [ ] Enter serial number
   - [ ] Set purchase date
   - [ ] Enter purchase price
   - [ ] Set current hours/mileage
   - [ ] Enter location/assignment
   - [ ] Upload equipment photo
   - [ ] Enter notes

3. **Save Equipment**
   - [ ] Click "Save" or "Add Equipment"
   - [ ] Verify success message
   - [ ] Confirm equipment appears in list
   - [ ] View equipment detail page

#### Update Equipment

1. **Record Maintenance**
   - [ ] Navigate to equipment detail
   - [ ] Click "Log Maintenance" or "Add Service"
   - [ ] Enter maintenance type
   - [ ] Set service date
   - [ ] Enter hours/mileage at service
   - [ ] Enter description of work
   - [ ] Enter cost
   - [ ] Upload receipts/photos
   - [ ] Save maintenance record

2. **Update Equipment Status**
   - [ ] Change status (Active/In Service/Out of Service)
   - [ ] Add reason for status change
   - [ ] Verify status badge updates
   - [ ] Check status history

3. **Update Hours/Mileage**
   - [ ] Find current hours field
   - [ ] Enter new hours/mileage
   - [ ] Save update
   - [ ] Verify hours updated in list and detail

#### View Equipment History

1. **View Maintenance History**
   - [ ] Navigate to equipment detail
   - [ ] Find maintenance history section
   - [ ] Verify all maintenance records listed
   - [ ] Check dates are in chronological order
   - [ ] View detailed maintenance record
   - [ ] Verify photos/receipts display

2. **View Equipment Reports**
   - [ ] View total maintenance cost
   - [ ] View cost per hour/mile
   - [ ] Check service intervals
   - [ ] View upcoming maintenance due

### Chemical Application Flow

#### Log Chemical Application

1. **Navigate to Chemical Application**
   - [ ] Click "Chemicals" in navigation
   - [ ] Click "Apply Chemical" or "Log Application"
   - [ ] Verify application form displays

2. **Select Chemical Product**
   - [ ] Search or select from chemical inventory
   - [ ] Verify product details display (name, type, EPA number)
   - [ ] Check recommended rates shown

3. **Fill Application Details**
   - [ ] Select application date and time
   - [ ] Select course area(s) applied
   - [ ] Enter application rate
   - [ ] Select rate unit (oz/1000 sq ft, lb/acre, etc.)
   - [ ] Enter total area treated
   - [ ] Calculate total amount used
   - [ ] Select weather conditions:
     - Temperature
     - Wind speed
     - Wind direction
     - Precipitation
   - [ ] Select application method (spray, granular, etc.)
   - [ ] Enter applicator name(s)
   - [ ] Enter target pest/disease/weed
   - [ ] Add application notes
   - [ ] Upload application map/photos

4. **Review and Submit**
   - [ ] Review application summary
   - [ ] Verify calculations are correct
   - [ ] Check regulatory compliance warnings (if any)
   - [ ] Click "Log Application"
   - [ ] Verify success message
   - [ ] Confirm application appears in history

5. **Validation Testing**
   - [ ] Try invalid application rate → warning shown
   - [ ] Try missing required fields → errors shown
   - [ ] Try application in restricted area → warning shown
   - [ ] Verify weather conditions within acceptable range

#### View Chemical Inventory

1. **View Chemical List**
   - [ ] Navigate to Chemicals page
   - [ ] View list of all chemicals
   - [ ] Verify each shows:
     - Product name
     - Active ingredient(s)
     - Current quantity
     - Storage location
     - Expiration date (if applicable)
   - [ ] Sort by different criteria
   - [ ] Filter by chemical type

2. **View Chemical Detail**
   - [ ] Click chemical to view detail
   - [ ] Verify Safety Data Sheet (SDS) link
   - [ ] View label information
   - [ ] Check application history for this product
   - [ ] View inventory levels over time

#### Manage Chemical Inventory

1. **Add New Chemical**
   - [ ] Click "Add Chemical"
   - [ ] Enter product name
   - [ ] Enter active ingredients
   - [ ] Enter EPA registration number
   - [ ] Upload SDS
   - [ ] Upload product label
   - [ ] Set initial quantity
   - [ ] Set storage location
   - [ ] Add notes
   - [ ] Save chemical

2. **Update Inventory Levels**
   - [ ] Find chemical in list
   - [ ] Click "Update Inventory"
   - [ ] Add quantity (new purchase)
   - [ ] Subtract quantity (application or disposal)
   - [ ] Enter transaction notes
   - [ ] Save update
   - [ ] Verify new quantity displayed

3. **Set Reorder Alerts**
   - [ ] Set minimum stock level
   - [ ] Enable low stock alerts
   - [ ] Verify alert appears when below threshold

---

## Testing Workflow

### Before Release

**1 Week Before Release:**
- [ ] Run full browser compatibility matrix
- [ ] Test PWA installation on iOS and Android
- [ ] Run Lighthouse audits on staging environment
- [ ] Perform network throttling tests
- [ ] Test all critical user flows manually

**3 Days Before Release:**
- [ ] Retest any fixes from previous testing
- [ ] Run automated test suite (if applicable)
- [ ] Perform responsive design checks on real devices
- [ ] Test offline functionality thoroughly

**1 Day Before Release:**
- [ ] Final Lighthouse audit on production-like environment
- [ ] Quick smoke test of all critical flows
- [ ] Verify no console errors or warnings
- [ ] Check that all required assets (icons, manifest) are present

### Post-Release

**Immediately After Release:**
- [ ] Test production deployment works
- [ ] Verify PWA installs correctly from production URL
- [ ] Quick check of critical user flows
- [ ] Monitor error tracking (Sentry)

**24 Hours After Release:**
- [ ] Review real user Core Web Vitals data
- [ ] Check PageSpeed Insights with field data
- [ ] Monitor error rates
- [ ] Collect user feedback on performance

**1 Week After Release:**
- [ ] Analyze performance trends
- [ ] Review user behavior analytics
- [ ] Identify any performance regressions
- [ ] Plan optimizations for next release

---

## Testing Tools Reference

### Required Tools

- **Chrome DevTools:** Browser testing, performance profiling, PWA debugging
- **Safari Web Inspector:** iOS and Safari-specific testing
- **Lighthouse:** Performance, accessibility, PWA audits
- **Network Throttling:** Simulate slow connections

### Recommended Tools

- **BrowserStack:** Cross-browser and device testing
- **PageSpeed Insights:** Production performance analysis
- **Chrome User Experience Report:** Real user metrics
- **Responsively App:** Multi-device responsive testing
- **Can I Use:** Feature compatibility checking

### Monitoring Tools (Production)

- **Vercel Analytics:** Performance monitoring (already integrated)
- **Vercel Speed Insights:** Core Web Vitals tracking (already integrated)
- **Sentry:** Error tracking (already integrated)
- **Google Search Console:** SEO and CrUX data

---

## Issue Reporting Template

When issues are found during testing, use this template to report them:

```
**Issue Title:** [Brief description]

**Severity:** Critical / High / Medium / Low

**Browser/Device:** [e.g., Chrome 130 on Windows, Safari on iPhone 14 Pro]

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Screenshots/Video:**
[Attach if applicable]

**Console Errors:**
[Copy any errors from browser console]

**Additional Context:**
[Any other relevant information]
```

---

## Checklist Summary

Use this quick checklist to ensure all testing areas are covered:

- [ ] PWA installation tested on iOS, Android, and Desktop
- [ ] Manifest validation passed
- [ ] Service Worker registered and working
- [ ] Offline mode functional
- [ ] Offline page displays correctly
- [ ] Cache strategies working (images, API, app shell)
- [ ] Browser compatibility verified (Chrome, Safari, Firefox, Edge)
- [ ] Mobile browsers tested (iOS Safari, Android Chrome)
- [ ] Responsive design checked (mobile, tablet, desktop)
- [ ] Lighthouse audits passed (Performance ≥90, Accessibility ≥95, PWA 100)
- [ ] Core Web Vitals targets met (LCP ≤2.5s, FID ≤100ms, CLS ≤0.1)
- [ ] Network throttling tests passed (3G, Slow 3G)
- [ ] Authentication flow tested
- [ ] Task creation/editing flow tested
- [ ] Equipment management flow tested
- [ ] Chemical logging flow tested
- [ ] No console errors or warnings
- [ ] Production deployment verified

---

**Document Version:** 1.0
**Last Updated:** 2026-03-27
**Maintained By:** GreenKeeper Pro Development Team
