# Gaming Backlog — Track, prioritize, and finish your games, beautifully.

[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=222)](#tech-stack)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind-38B2AC?logo=tailwind-css&logoColor=fff)](#tech-stack)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=fff)](#tech-stack)
[![Express](https://img.shields.io/badge/API-Express-000?logo=express&logoColor=fff)](#tech-stack)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-4169E1?logo=postgresql&logoColor=fff)](#tech-stack)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=fff)](#features)
[![Vercel](https://img.shields.io/badge/Frontend%20Hosting-Vercel-000?logo=vercel&logoColor=fff)](#deployment)
[![Railway](https://img.shields.io/badge/Backend%20Hosting-Railway-0B0D0E?logo=railway&logoColor=fff)](#deployment)

## Overview
**Gaming Backlog** is a full-stack app to organize your video game backlog, prioritize what to play next, and visualize progress. It supports secure multi-user accounts, drag-and-drop manual ordering per status, a public read-only profile, and an insights tab with charts. The app enriches entries with cover art and metadata via the RAWG API.

## Features
- **Secure auth & isolation** — JWT authentication with strict per-user data access.
- **Admin workflows** — Add, edit, delete, and reorder games (drag-and-drop via `@dnd-kit`).
- **Manual ordering per status** — Persistent `position` values and safe reordering within the same status group.
- **Public profiles** — Share a read-only list at `/u/:username`.
- **Insights & analytics** — Charts with a lightweight caching layer for fast loads.
- **RAWG integration** — Auto-hydrate cover art, ratings, genres, and playtime hints.
- **Hardened backend** — Helmet, CORS allowlist/suffix support, rate limiting, and structured error handling.
- **PostgreSQL schema & indexes** — Normalized tables (`users`, `statuses`, `games`) with status ranking and stored positions.

## Tech Stack
**Frontend:** React, Vite, Tailwind CSS, Recharts  
**Backend:** Node.js, Express, (Joi/Celebrate), Helmet, CORS, Rate Limiter  
**Database:** PostgreSQL (SQL schema + seed), `pg` client  
**Deploy:** Vercel (frontend), Railway (backend & Postgres)

---

## Getting Started

### Prerequisites
- **Node.js 20+** and npm/pnpm/yarn
- **PostgreSQL 14+** (local or managed)

#### 1) Clone & Install
```bash
git clone <your-repo-url>.git
cd <repo>
npm install
