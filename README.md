# TEd_trackIT

TEd_trackIT is a production-focused inventory and asset tracking platform built for engineering teams, remote production workflows, and secure cabinet operations.

## Core Capabilities

- Inventory lifecycle management with create/edit/delete and batch actions
- Secure cabinet check-in/check-out workflows
- User-defined taxonomy (categories, units, locations, suppliers, projects, expense codes)
- Report generation with preview, CSV export, and enhanced XLSX export
- Durable audit, security, and performance logging
- Single-item and bulk label printing with configurable layouts
- Backup, restore, import, and export workflows

## Runtime Stack

- React + TypeScript + Vite renderer
- Tailwind + shadcn/ui components
- React Hook Form + Zod validation
- Local storage + optional Supabase synchronization

## Quick Start

1. Install dependencies

```bash
npm install
```

1. Start development

```bash
npm run dev
```

1. Open the local web app URL shown by Vite (typically `http://localhost:5173`).

## Main Routes

- `/` Dashboard
- `/inventory` Inventory management
- `/checkout` Secure cabinet check-in/out (navigation label **Check-In/Out**)
- `/reports` Reporting and exports
- `/settings` App configuration and management
- `/help` In-app documentation
- `/about` Product information and easter egg page

## Documentation

Use the docs index as the canonical entry point:

- [Docs Index](./docs/README.md)
- [Project Structure](./docs/project-structure.md)

## License

MIT (see `LICENSE` if present in this repository).