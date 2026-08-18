import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This project's single source of truth for agent instructions is the
  // root AGENTS.md/CLAUDE.md (see AGENTS.md) - don't let Next.js generate
  // its own copies inside packages/web.
  agentRules: false,
};

export default nextConfig;
