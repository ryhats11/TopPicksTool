# Sub-ID Generator & Tracker

## Overview

A web-based application for managing unique tracking codes (Sub-IDs) across multiple websites and brand rankings by geographic region. The system includes two main modules:

1. **Sub-ID Tracker**: Manages unique tracking codes across multiple websites with customizable format patterns, ClickUp CMS integration, and affiliate link management
2. **Brand Rankings**: Maintains brand lists per geographic region (GEO):
   - **Featured Brands**: Top 10 ranked brands (positions 1-10) with affiliate link tracking
   - **Other Brands**: Unlimited non-featured brands per GEO for organization and tracking

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
- Collapsible sidebar navigation for website and GEO management
- Multi-dialog system for adding websites, GEOs, brands, and bulk importing Sub-IDs
- Real-time duplicate detection across all Sub-IDs
- CSV export functionality for Sub-ID data
- Brand rankings editor with position management (1-10) and affiliate link tracking
- Theme toggle supporting light and dark modes
- Responsive design with mobile-first breakpoints
- Navigation between Sub-ID Tracker and Brand Rankings modules

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
- **GeoBrandRankings Table**: Junction table for GEO-Brand relationships with position and affiliate link data
  - Position (nullable): 1-10 for featured brands, null for non-featured brands
  - Optional affiliate link, timestamp
  - Unique constraints on (geoId, position) when position is not null, and (geoId, brandId) to prevent duplicates
  - Foreign keys to GEOs and Brands with cascade delete
  - Supports both featured (top 10 ranked) and unlimited non-featured brands per GEO
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