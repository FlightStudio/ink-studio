# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                           | Role                                                   |
| ----------------- | ------------------------------ | ------------------------------------------------------ |
| typescript-config | `packages/typescript-config`   | Shared TypeScript presets                              |
| logger            | `packages/logger`              | Structured log helper                                  |
| types             | `packages/types/src/index.ts`  | Identity shapes, including `Member`                    |
| errors            | `packages/errors/src/index.ts` | `errorMessages`                                        |
| api               | `packages/api/openapi.yaml`    | HTTP contract. Client is `packages/api/src/gen/api.ts` |
| tools             | `tools/check-comments.ts`      | No-comment check                                       |
| tools             | `tools/check-architecture.ts`  | This map stays honest                                  |
1. An app may import packages. A package never imports an app.
2. Dependencies point toward `packages/types`. `packages/errors` stands alone. `packages/api` may import `packages/errors`.

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
