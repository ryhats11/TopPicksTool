# Sub-ID Generator & Tracker

## Overview

A web-based application for managing unique tracking codes (Sub-IDs) across multiple websites and brand rankings by geographic region. The system includes three main modules:

1. **Sub-ID Tracker**: Manages unique tracking codes across multiple websites with customizable format patterns, ClickUp CMS integration, and affiliate link management
2. **Brand Rankings**: Maintains multiple brand lists per geographic region (GEO):
   - Each GEO automatically receives three default brand lists upon creation: "Casino", "Sports", and "Crypto"
   - Users can create additional brand lists, rename existing lists, or delete lists as needed
   - **Featured Brands**: Unlimited ranked brands (positions 1+) per list with affiliate link tracking
   - **Other Brands**: Unlimited non-featured brands per list for organization and tracking
   - Drag-and-drop reordering for both featured brands (positions) and other brands (custom sortOrder)
3. **Top Picks Tool**: Cross-references ClickUp task IDs against brand rankings and Sub-ID tracker to identify:
   - Website associations (matched from task names)
   - Featured brand matches for selected GEO
   - Existing Sub-IDs linked to task IDs

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server, providing fast HMR and optimized production builds
- Wouter for lightweight client-side routing (single-page application with dashboard and 404 pages)

**UI Component System**
- shadcn/ui component library (New York style variant) built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Linear/Notion-inspired design system emphasizing functional clarity and information hierarchy
- Custom CSS variables for theming (light/dark mode support)
- Typography system using Inter for UI elements and JetBrains Mono for code-like content (Sub-IDs, patterns)

**State Management**
- TanStack Query (React Query) for server state management, caching, and data fetching
- Local React state for UI interactions (dialogs, selections, form inputs)
- Custom hooks for reusable logic (mobile detection, toast notifications)

**Key UI Features**
- Shared navigation header (PageNav component) providing consistent access to all three modules
  - Active page visual highlighting using variant-based button states
  - Sticky positioning with backdrop blur effect
  - Optional sidebar toggle for pages with sidebars
  - Optional contextual title display (e.g., selected GEO name)
  - Theme toggle always accessible on the right side
- Collapsible sidebar navigation for website and GEO management
- Multi-dialog system for adding websites, GEOs, brands, and bulk importing Sub-IDs
- Real-time duplicate detection across all Sub-IDs
- CSV export functionality for Sub-ID data
- Brand rankings editor with unlimited position management and affiliate link tracking
- Responsive design with mobile-first breakpoints

### Backend Architecture

**Server Framework**
- Express.js as the HTTP server framework
- TypeScript for type safety across the entire backend
- Custom middleware for request logging and JSON body parsing with raw body preservation

**API Design**
- RESTful endpoints organized by resource type (websites, subids, geos, brands, rankings)
- Route handlers separated into dedicated routes module
- Consistent error handling with appropriate HTTP status codes
- JSON response format for all API endpoints
- Zod validation for all POST/PUT requests
- GEO creation automatically includes atomic creation of default brand lists (Casino, Sports, Crypto) with rollback on failure

**Data Access Layer**
- Storage abstraction pattern (IStorage interface) for flexibility
- DbStorage implementation using Drizzle ORM
- Separation of concerns: routes handle HTTP, storage handles data operations
- Transaction support through Drizzle's underlying database driver

**Sub-ID Generation Logic**
- Pattern-based generation supporting multiple variable types:
  - Random digits (2-8 characters)
  - Random letters (2-6 characters)
  - Random alphanumeric (4-12 characters)
  - Timestamps, dates, year/month/day components
  - UUID segments and hexadecimal strings
- Uniqueness validation before insertion
- Bulk creation support for importing multiple Sub-IDs with URLs

### Data Storage

**Database Technology**
- PostgreSQL as the primary database (via Neon serverless)
- WebSocket-based connection pooling for serverless environments
- Drizzle ORM for type-safe database queries and schema management

**Schema Design**
- **Websites Table**: Stores website configurations with ID, name, and format pattern
- **SubIds Table**: Stores generated Sub-IDs with relationships to websites
  - Includes value, optional URL, timestamp, immutability flag, ClickUp task ID, comment posted flag
  - Foreign key constraint with cascade delete to maintain referential integrity
- **GEOs Table**: Stores geographic regions with code, name, and sort order
- **Brands Table**: Global brand directory with name, default URL, and status
- **BrandLists Table**: Stores named brand lists per GEO
  - Each GEO can have multiple brand lists (e.g., "Sports Betting", "Casino")
  - Includes GEO ID, list name, and sort order
  - Unique constraint on (geoId, name) to prevent duplicate list names per GEO
  - Foreign key to GEOs with cascade delete
- **GeoBrandRankings Table**: Junction table linking brand lists to brands with rankings
  - Links to both GEO and BrandList (for efficient querying)
  - Position (nullable): 1+ for featured brands, null for non-featured brands
  - Optional affiliate link, timestamp
  - Unique constraints on (listId, position) when position is not null, and (listId, brandId) to prevent duplicates
  - Foreign keys to GEOs, BrandLists, and Brands with cascade delete
  - Supports unlimited featured (ranked) and non-featured brands per list
- UUID-based primary keys generated via `gen_random_uuid()`
- Immutability feature prevents deletion of websites with marked Sub-IDs

**Migration Strategy**
- Drizzle Kit for schema migrations
- Schema definitions in shared TypeScript for type inference across frontend and backend
- Zod integration for runtime validation of insert operations

### External Dependencies

**Third-Party Services**
- **Neon Database**: Serverless PostgreSQL hosting with WebSocket support
- **Google Fonts**: Inter and JetBrains Mono font families for typography

**NPM Packages**
- **@neondatabase/serverless**: PostgreSQL client for serverless environments with WebSocket support
- **drizzle-orm & drizzle-kit**: Type-safe ORM and migration tooling
- **@tanstack/react-query**: Server state management and data synchronization
- **@radix-ui/***: Headless UI component primitives for accessibility
- **@hookform/resolvers**: Form validation integration
- **zod & drizzle-zod**: Runtime schema validation
- **date-fns**: Date formatting and manipulation
- **class-variance-authority & clsx**: Conditional CSS class utilities
- **cmdk**: Command menu component
- **embla-carousel-react**: Carousel functionality
- **lucide-react**: Icon library
- **tailwind-merge**: Tailwind class merging utility
- **vaul**: Drawer component implementation

**Development Tools**
- **Replit-specific plugins**: Runtime error overlay, cartographer, dev banner for development environment
- **TypeScript**: Type checking across entire codebase
- **ESBuild**: Production server bundling
- **tsx**: TypeScript execution for development server

**Browser APIs**
- LocalStorage for theme persistence
- Clipboard API for copy-to-clipboard functionality
- URL parsing for bulk import validation

### ClickUp CMS Integration

**Authentication & API**
- Uses CLICKUP_API_KEY stored in Replit Secrets for secure API access
- RESTful API integration with ClickUp v2 endpoints
- Task fetching, comment posting, and custom field reading

**URL Synchronization**
- Automatically fetches URLs from ClickUp task custom field "*Live URL"
- Bulk refresh feature to update all Sub-IDs with missing URLs
- Updates are fetched on-demand to ensure data freshness

**Affiliate Link Extraction**
- Parses task descriptions to extract affiliate tracking links from 🥇 TOP PICKS LINEUP table
- Identifies and filters out cloaked links (pokerology.com domains)
- Extracts tracking links with position metadata for accurate replacement
- Lazy-loads affiliate links only when dropdown is opened for performance
- Wide dropdown (800px) with custom orange scrollbar matching brand colors

**Comment Posting with TOP PICKS LINEUP Table**
- Posts entire 🥇 TOP PICKS LINEUP table as ClickUp comment using structured JSON format
- Replaces ClickUp task ID with Sub-ID in all tracking URLs
- Supports 70+ tracking parameters with case-sensitive matching:
  - Core: `payload`, `subid`, `sub_id`, `clickid`, `click_id`, `clickID`
  - Campaign: `campaign`, `campaign_id`, `affid`, `aff_id`, `affiliate_id`
  - Tracking: `tracking`, `tracker`, `ref`, `reference`, `source`
  - UTM: `utm_campaign`, `utm_source`, `utm_medium`, `utm_term`, `utm_content`
  - IDs: `pid`, `aid`, `sid`, `cid`, `tid`, `btag`, `tag`, `var`
  - Advanced: `partner_id`, `offer_id`, `creative_id`, `ad_id`, `transaction_id`
  - Sub-IDs: `subid1-5`, `aff_sub`, `aff_sub2-5`, `data1-3`, `adv1-2`
  - Context: `geo`, `country`, `lang`, `device`, `os`, `browser`, `platform`
  - And many more (see server/routes.ts for complete list)
- Removes cloaked links (pokerology.com URLs) from table
- Uses ClickUp's structured JSON format with code blocks for proper formatting
- Individual comment button (💬 icon) for single Sub-ID posting
- Bulk comment feature to post tables for all Sub-IDs with ClickUp tasks
- Comment buttons remain unlocked to allow reposting/updates
- Duplicate detection prevents posting same Sub-ID multiple times to same task

### Top Picks Tool Module

**Purpose**: Batch analysis tool for ClickUp tasks to identify relationships with websites, brands, and Sub-IDs

**Auto-Detection**: Each task's "*Target GEO" and "*Publisher" custom fields are automatically extracted from ClickUp, allowing mixed-GEO batches in a single analysis

**ClickUp Custom Field Handling**:
- Supports dropdown/select fields (type `drop_down` or `labels`) where values are numeric IDs
- Maps numeric IDs to option names via field's `type_config.options`
- Falls back to text field handling for other field types
- Handles both string values and complex object structures

**Workflow**:
1. User pastes ClickUp task IDs (one per line or comma-separated)
2. System analyzes each task:
   - Fetches task details and custom fields from ClickUp API
   - Extracts "*Target GEO" custom field:
     - For dropdown fields: maps numeric value to option name from field configuration
     - For text fields: extracts string value directly
     - Maps GEO code (e.g., "USA", "UK") to database GEO via case-insensitive lookup
   - Extracts "*Publisher" custom field to identify the website:
     - For dropdown fields: maps numeric value to option name from field configuration
     - For text fields: extracts string value directly
   - Matches "*Publisher" value against website names using strict matching:
     - First attempts exact match (after normalization)
     - Then filters common filler words (publisher, site, casino, poker, betting, etc.)
     - Requires exact word-by-word equality (no substring matches)
     - Only accepts unambiguous single match
   - Falls back to task name matching if "*Publisher" is not set, ambiguous, or no match found
   - Extracts "*Subniche" custom field and intelligently selects the appropriate brand list:
     - If Subniche contains "Crypto" or "Bitcoin" → selects Crypto brand list
     - If Subniche contains "Sports", "betting", or "bookmaker" → selects Sports brand list
     - Otherwise defaults to first brand list (typically Casino)
   - Searches task name/description for featured brand names from that task's specific brand list
   - Checks if Sub-ID already exists for the task ID

**Results Display**:
- Task ID
- Detected Target GEO (shows code badge or "Not set" if missing)
- Manual GEO selector (compact 2-letter code display) for overriding auto-detected GEO
- Brand list selector for choosing which list to use for brand matching
- Website association (detected from "*Publisher" custom field or task name, cleaned to remove *pm- prefix)
- Brand match showing position and name (if found in that task's specific brand list)
- Sub-ID status (exists/not found)
- Sub-ID value (if already created)
- Error messages for ClickUp API failures

**Website Name Display**:
- Automatically removes "*pm-" prefix from website names in results table
- Shows clean domain name only for better readability

**Data Sources**:
- ClickUp API for task metadata and custom fields
- Sub-ID Tracker database for existing task-to-Sub-ID mappings and website names
- Brand Rankings database for featured brands per GEO
- Global Brands table for brand name matching

**Navigation**: Accessible from dashboard header via "Top Picks Tool" button