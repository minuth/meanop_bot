# AI Agent Instructions

Coding guidelines for AI agents working in this project.

## Philosophy

- Minimalism. Simple is better. KISS (Keep It Simple, Stupid).
- Clean code, easy to read, easy to delete.
- Functional Programming - pure functions, immutability, no side effects.
- MVP mindset - deliver the smallest thing that works, then iterate.
- Always update `.env.example` whenever introducing a new environment variable or configuration option.
- Strict single execution paths - avoid unnecessary options, fallbacks, or redundant environment variable aliases.

## Security Rules (CRITICAL - no exceptions)

- NEVER output or request .env and example.env file contents
