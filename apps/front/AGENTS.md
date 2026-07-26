<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## UI Components

- Use only the existing shadcn components exported from `@repo/ui/components/ui` for user-interface primitives.
- Do not introduce another component library or create custom replacements for shadcn primitives.
- When a needed primitive is missing, add the corresponding shadcn component to `@repo/ui` before using it.
- Do not override the theme or visual styling of shadcn components with `className`. Use their default appearance and documented variants or size props only.
- `className` is allowed only on non-shadcn layout wrappers; it must not be used to restyle a shadcn primitive.
