# Muis Bakery

Inventory, production, sales, and management system for Muis Foods.

## Architecture

```mermaid
flowchart LR
	U[User Browser] --> W[apps/web\nNext.js App Router]
	W -->|HTTP / fetch / auth cookies| A[apps/api\nNestJS API]
	A --> P[(PostgreSQL)]
	A --> PR[Prisma ORM]
	W -->|renders pages, layouts, forms| UI[React/TSX components]
	A -->|guards, services, controllers| B[Business rules]
	A -->|real-time events| S[Socket/WebSocket]
```

