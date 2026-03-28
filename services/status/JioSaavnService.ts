/**
 * JioSaavnService.ts
 *
 * Searches songs via the free JioSaavn API and returns
 * structured results for the status song-picker UI.
 */

import axios from 'axios';

const BASE_URL = 'https://saavn.sumit.co/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaavnSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;        // 500x500 image URL
  albumArtSmall: string;   // 150x150 image URL
  duration: number;        // seconds
  streamUrl: string;       // 160kbps MP4 stream URL
  year: string;
  language: string;
  hasLyrics: boolean;
  playCount: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class JioSaavnService {
  /**
   * Search songs by name.
   * @param query   Search term (e.g. "Believer", "Arijit Singh")
   * @param page    Page number (1-indexed)
   * @param limit   Results per page (default 10)
   */
  public async searchSongs(
    query: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ songs: SaavnSong[]; total: number }> {
    try {
      const response = await axios.get(`${BASE_URL}/search/songs`, {
        params: { query, page, limit },
        timeout: 10000,
      });

      if (!response.data?.success || !response.data?.data?.results) {
        return { songs: [], total: 0 };
      }

      const raw = response.data.data;
      const songs: SaavnSong[] = raw.results.map((item: any) => this.mapSong(item));

      return { songs, total: raw.total || 0 };
    } catch (error) {
      console.error('[JioSaavn] Search failed:', error);
      return { songs: [], total: 0 };
    }
  }

  /**
   * Get trending / popular songs (searches "trending" or "top songs").
   * Used to pre-populate the song picker before user types.
   */
  public async getTrendingSongs(limit: number = 15): Promise<SaavnSong[]> {
    const { songs } = await this.searchSongs('trending hindi songs', 1, limit);
    return songs;
  }

  /**
   * Maps raw JioSaavn API response to our clean SaavnSong type.
   */
  private mapSong(item: any): SaavnSong {
    // Pick best quality image
    const images = item.image || [];
    const albumArt = images.find((i: any) => i.quality === '500x500')?.url || '';
    const albumArtSmall = images.find((i: any) => i.quality === '150x150')?.url || albumArt;

    // Pick 160kbps stream URL (good balance of quality vs bandwidth)
    const downloads = item.downloadUrl || [];
    const streamUrl =
      downloads.find((d: any) => d.quality === '160kbps')?.url ||
      downloads.find((d: any) => d.quality === '96kbps')?.url ||
      downloads[downloads.length - 1]?.url ||
      '';

    // Primary artist name
    const primaryArtists = item.artists?.primary || [];
    const artist = primaryArtists.map((a: any) => a.name).join(', ') || 'Unknown';

    return {
      id: item.id || '',
      name: item.name || 'Unknown Song',
      artist,
      album: item.album?.name || '',
      albumArt,
      albumArtSmall,
      duration: item.duration || 0,
      streamUrl,
      year: item.year || '',
      language: item.language || '',
      hasLyrics: item.hasLyrics || false,
      playCount: item.playCount || 0,
    };
  }
}

export default new JioSaavnService();
