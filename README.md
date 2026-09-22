# YSS Website - Yoshi's Signalling Server

A web application for managing training sessions, staff, and trainee progress in a Roblox-based training environment.

## Overview

YSS (Yoshi's Signalling Server) is a Next.js web application that provides tools for managing training sessions, staff directories, session logistics, and trainee assessment. Built with Supabase for authentication and database storage, it uses Discord as the primary authentication method.

## Key Features

### Authentication & Authorization
- **Discord Authentication**: Users sign in with their Discord accounts
- **Role-Based Access Control**: Different staff ranks determine available features:
  - Operations Manager (OM)
  - Community Manager (CM) 
  - Head Staff (HS)
  - Host Authorized
  - Co-Host Authorized
  - Assistant Authorized
  - Event Authorized
  - Administrators/Owners/Developers/Moderators (full access)
- **Permission Levels**: Granular controls for accessing specific tables and functions

### Session Management
- **Session Booking**: Create and manage upcoming training sessions
- **Live Session Tracking**: Monitor ongoing sessions in real-time
- **Session History**: View past sessions and attendance records
- **Trainee Management**: Assign trainees to zones and trainers
- **Attendance Tracking**: Record trainee participation and completion
- **Assessment System**: Track trainee scores and feedback

### Staff Management
- **Staff Directory**: View and manage staff profiles
- **Staff Timelines**: Track authorization expiration dates
- **Quota Management**: Monitor staff session hosting requirements
- **Role Management**: Assign and update staff ranks and permissions

### Administrative Functions
- **Announcements System**: Create and manage system notifications
- **Site Admin Controls**: Manage owner/developer/moderator access
- **Event Management**: Track upcoming and past events
- **Data Export/Import**: Manage various logs and records

### Interface
- **Dashboard**: Role-based bento card interface showing available features
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Theme**: Optimized for low-light environments
- **Glassmorphism UI**: Modern frosted glass design elements

## Technology Stack

- **Frontend**: Next.js 13+ (App Router), React, TypeScript
- **Styling**: CSS with glassmorphism effects, blurred backgrounds
- **Authentication**: Supabase Auth (Discord provider)
- **Database**: Supabase PostgreSQL
- **Icons**: Font Awesome (Free Solid and Brands)
- **Deployment**: Vercel-ready

## Database Schema

The application uses the following key tables:

- **profiles**: Basic user information from Discord
- **staff_profiles**: Staff-specific information (rank, permissions)
- **site_admins**: Administrative access levels
- **session_upcoming**: Scheduled training sessions
- **session_ongoing**: Currently active sessions
- **session_post_logs**: Completed session summaries
- **session_full_logs**: Detailed trainee performance records
- **staff_directory**: Combined view of profiles + staff_profiles
- **staff_quota**: Staff session hosting requirements
- **staff_timeline**: Authorization expiration tracking
- **notifications**: System announcements
- **event_upcoming/event_log_archives**: Event management

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- Discord application (for OAuth)

### Environment Variables
Create a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with
`NEXT_PUBLIC_` or expose it to browser code.

### Installation
```bash
npm install
npm run dev
```

### Database Setup
1. Treat `database/current_db.sql` as the current schema reference. The older
   `database/schema.sql` is a legacy snapshot and must not be run.
2. Set up Supabase Auth with Discord provider
3. Configure OAuth redirect URLs

## Project Structure

```
app/
├- layout.tsx          # Root layout with global styles
├- page.tsx            # Home page (redirects to login)
├- (public)/           # Public routes (login)
│   └- login/          # Login page
├- (app)/              # Authenticated routes
│   ├- dashboard/      # User dashboard
│   ├- active/         # Live session viewing
│   ├- managesession/  # Session management
│   ├- staff/          # Staff directory
│   ├- manage/         # Administrative interfaces
│   └- legal/          # Terms, privacy, etc.
├- api/                # API routes
│   └- manage/         # Data management endpoints
├- lib/                # Utilities and helpers
│   ├- getCurrentUser.ts # Auth helper
│   ├- roles.ts        # Role-based access logic
│   ├- manageTables.ts # Data table configurations
│   └- icons.ts        # Icon definitions
�└- components/         # Reusable components
    └- VersionBadge.ts # App version display
```

## Role-Based Access

Different roles have access to different features:

### Operations Manager (OM) & Community Manager (CM)
- Full access to session booking and management
- Staff directory and timeline management
- Quota management
- Most administrative functions

### Head Staff & Host Authorized
- Session booking and management
- Staff viewing (limited editing)
- Basic session controls

### Co-Host Authorized, Assistant Authorized, Event Authorized
- Session participation tracking
- Limited session management
- Personal session viewing

### Non-Staff Members
- View active sessions
- See upcoming/past sessions
- Basic information access

### Administrators (Owner/Developer/Moderator)
- Full system access
- Administrative controls
- Site management
- All features available

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

This project is proprietary software. All rights reserved.

## Acknowledgments

- Built with Next.js and Supabase
- Uses Font Awesome for icons
- Authenticated via Discord OAuth
