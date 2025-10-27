# Sub-ID Generator & Tracker

## Overview

A web-based application for managing unique tracking codes (Sub-IDs) across multiple websites. Each website can have its own customizable Sub-ID format pattern, ensuring uniqueness and pattern diversity so that different sites cannot be identified as belonging to the same owner. The system provides tools for generating, tracking, importing, and exporting Sub-IDs with a focus on data integrity and user productivity.

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
- Collapsible sidebar navigation for website management
- Multi-dialog system for adding websites and bulk importing Sub-IDs
- Real-time duplicate detection across all Sub-IDs
- CSV export functionality for Sub-ID data
- Theme toggle supporting light and dark modes
- Responsive design with mobile-first breakpoints

### Backend Architecture

**Server Framework**
- Express.js as the HTTP server framework
- TypeScript for type safety across the entire backend
- Custom middleware for request logging and JSON body parsing with raw body preservation

**API Design**
- RESTful endpoints organized by resource type (websites, subids)
- Route handlers separated into dedicated routes module
- Consistent error handling with appropriate HTTP status codes
- JSON response format for all API endpoints

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
  - Includes value, optional URL, timestamp, and immutability flag
  - Foreign key constraint with cascade delete to maintain referential integrity
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