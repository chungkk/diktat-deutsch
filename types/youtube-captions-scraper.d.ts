declare module 'youtube-captions-scraper' {
  interface Caption {
    start: string;
    dur: string;
    text: string;
  }

  interface GetSubtitlesOptions {
    videoID: string;
    lang?: string;
  }

  export function getSubtitles(options: GetSubtitlesOptions): Promise<Caption[]>;
}
