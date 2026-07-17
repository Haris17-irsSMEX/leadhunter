import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://leadhunter.irssmex.com";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/privacy", "/terms"],
      disallow: ["/dashboard", "/finder", "/leads", "/integrations", "/google-sheets", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
