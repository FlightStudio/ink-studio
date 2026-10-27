# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                          | Role                      |
| ----------------- | ----------------------------- | ------------------------- |
| typescript-config | `packages/typescript-config`  | Shared TypeScript presets |
| logger            | `packages/logger`             | Structured log helper     |
| tools             | `tools/check-comments.ts`     | No-comment check          |
| tools             | `tools/check-architecture.ts` | This map stays honest     |

## One letter, end to end

Filled as the editor lands.

## Jobs

Filled as jobs land.

## Tables

Filled as tables land.

## Where to change things

Repo checks live in `tools/check.ts`.

## Moving into project-post

Shared packages are shaped so the move is a folder merge. The plan is `PLAN.md`.
