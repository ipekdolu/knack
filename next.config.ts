import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Phase 8 restructure split practice into Vocab (acquisition) and
  // Activities (application). These keep old bookmarks and browser history
  // working instead of 404ing.
  async redirects() {
    return [
      { source: "/practice", destination: "/activities", permanent: false },
      {
        source: "/practice/flashcards",
        destination: "/vocab/review",
        permanent: false,
      },
      // Phase 12 replaced the two old speak/:slug sub-pages with a single
      // conversational module -- both old deep links land there now.
      {
        source: "/practice/speak/:slug",
        destination: "/activities/speak",
        permanent: false,
      },
      {
        source: "/activities/speak/:slug",
        destination: "/activities/speak",
        permanent: false,
      },
      {
        source: "/practice/:slug",
        destination: "/activities/:slug",
        permanent: false,
      },
      { source: "/words/add", destination: "/vocab/add", permanent: false },
    ];
  },
};

export default nextConfig;
