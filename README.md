# Sub-ID Tracker & Top Picks Tool

A web-based application for managing unique tracking codes (Sub-IDs) across multiple websites with ClickUp CMS integration and brand ranking management.

## Features

### 1. Sub-ID Tracker
- Generate unique tracking codes with customizable format patterns
- ClickUp integration for task management
- Automatic URL fetching from ClickUp tasks
- Affiliate link extraction and management
- CSV export functionality
- Bulk import with duplicate detection

### 2. Brand Rankings
- Manage brand lists per geographic region (GEO)
- Default lists: Casino, Sports, Crypto (auto-created per GEO)
- Create custom brand lists as needed
- Featured brands (unlimited positions) with affiliate links
- Unlimited non-featured brands per list
- Drag-and-drop reordering

### 3. Top Picks Tool
- Batch analysis of ClickUp tasks
- Auto-detection of Target GEO, Publisher, and Subniche from custom fields
- Intelligent brand list selection based on Subniche
- Cross-reference tasks against brand rankings and Sub-IDs
- Bulk Sub-ID creation
- Bulk brand ranking posting to ClickUp
- localStorage persistence for work-in-progress

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Wouter for routing
- TanStack Query for data fetching
- shadcn/ui component library
- Tailwind CSS for styling

### Backend
- Express.js server
- PostgreSQL database (Neon)
- Drizzle ORM
- ClickUp API integration

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or use Replit's built-in database)
- ClickUp API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ryhats11/TopPicksTool.git
cd TopPicksTool
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file with the following:
```
DATABASE_URL=your_postgres_connection_string
CLICKUP_API_KEY=your_clickup_api_key
SESSION_SECRET=your_session_secret
```

4. Push database schema:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `CLICKUP_API_KEY` - ClickUp API key for integration
- `SESSION_SECRET` - Secret for session management
- `NODE_ENV` - Environment (development/production)

## Database Schema

The application uses the following main tables:
- `websites` - Website configurations with format patterns
- `subids` - Generated tracking codes with ClickUp task associations
- `geos` - Geographic regions
- `brands` - Global brand directory
- `brand_lists` - Named brand lists per GEO
- `geo_brand_rankings` - Brand rankings per list with affiliate links

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run db:push` - Push schema changes to database
- `npm run check` - Type check with TypeScript

## License

MIT
