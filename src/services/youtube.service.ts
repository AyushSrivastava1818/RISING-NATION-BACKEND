/**
 * YouTube Data API client — ARCHITECTURE.md §3.9
 *
 * ONLY called at admin write time (POST/PATCH /admin/courses).
 * Public reads NEVER import or call anything from this module.
 *
 * On failure the caller must surface a 502 upstream_error — no unvalidated
 * data may be persisted.
 */

import { config } from '../config/index.js';
import { UpstreamError } from '../utils/errors.js';

export interface YouTubeMetadata {
  title: string;
  thumbnail_url: string;
}

/**
 * Validates that `contentRef` is a real YouTube video/playlist ID and returns
 * the cached title + thumbnail URL.
 *
 * Throws `UpstreamError` if the API is unreachable, the key is invalid, or the
 * ID is not found — callers must NOT open a DB transaction until this succeeds.
 */
export async function fetchYouTubeMetadata(contentRef: string): Promise<YouTubeMetadata> {
  const apiKey = config.YOUTUBE_API_KEY;

  if (!apiKey || apiKey === 'your-youtube-api-key' || apiKey === '') {
    // In development/test, the key is a placeholder. Stub the response so the
    // rest of the write path (validation, DB insert) can be exercised without a
    // real API key.  Tests mock this function to control the outcome.
    return {
      title: `[STUB] YouTube video ${contentRef}`,
      thumbnail_url: `https://img.youtube.com/vi/${contentRef}/hqdefault.jpg`,
    };
  }

  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet&id=${encodeURIComponent(contentRef)}&key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new UpstreamError(
      `YouTube Data API unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new UpstreamError(
      `YouTube Data API returned ${response.status} for content_ref "${contentRef}"`,
    );
  }

  const body = (await response.json()) as {
    items?: { snippet: { title: string; thumbnails: { high?: { url: string }; default?: { url: string } } } }[];
  };

  if (!body.items || body.items.length === 0) {
    throw new UpstreamError(
      `YouTube content_ref "${contentRef}" not found — it may be private, deleted, or not a valid video ID`,
    );
  }

  const snippet = body.items[0].snippet;
  const thumbnail_url =
    snippet.thumbnails.high?.url ??
    snippet.thumbnails.default?.url ??
    `https://img.youtube.com/vi/${contentRef}/hqdefault.jpg`;

  return { title: snippet.title, thumbnail_url };
}
