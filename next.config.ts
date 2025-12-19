import "@/env";

import type { NextConfig } from "next";

import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["zlib-sync"],
};

export default withWorkflow(nextConfig);
