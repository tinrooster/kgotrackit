# TEd_trackIT Documentation Index

## Purpose

TEd_trackIT is a production-oriented inventory and asset workflow tool for engineering, maintenance, and remote operations.  
This docs index is the single entry point for setup, operations, architecture, and troubleshooting.

## Primary Documents

1. [Getting Started](getting-started.md)  
   Install, run, and verify local development workflows.

2. [User Guide](user-guide.md)  
   Day-to-day usage for Inventory, Check-In/Out, Reports, and Settings.

3. [Technical Documentation](technical-documentation.md)  
   System architecture, data flows, and implementation details.

4. [Settings Architecture](settings-architecture.md)  
   Settings data model, propagation behavior, and synchronization rules.

5. [Framework](framework.md)  
   Application stack, conventions, and core runtime behavior.

6. [Troubleshooting](troubleshooting.md)  
   Known failure patterns and operational recovery paths.

7. [Development Status](development-status.md)  
   Current feature maturity and project status notes.

8. [Production roadmap](production-roadmap.md)  
   In-repo production plan: P0–P3 priorities, data-model notes, and todo status.

9. [Changes / changelog](changes.md)  
   Notable feature and documentation updates by period.

## Supplemental Guides

- [P3: Workspaces, RBAC, auth](p3-workspaces-auth.md)  
  Team `workspace_app_data`, SQL invite snippet, magic link, MFA notes.

- [Help Menu Reference](help-menu.md)  
  In-app Help content map and where users should go for each workflow.

- [Logging](logging.md)  
  Logger API, log levels/types, and System Logs behavior.

- [Repository Reference](repository-reference.md)  
  Directory-level overview of frontend, backend, Electron runtime, and docs.

## High-Level Feature Coverage

- Durable inventory CRUD with per-item auditing
- Secure cabinet check-in/check-out operations (top nav: **Check-In/Out**)
- Bulk editing and bulk label-print workflows
- Production-focused report generation with CSV/XLSX export
- User-defined taxonomy and financial coding support
- Security and performance event logging in System Logs
- Data import/export/backup and restore flows