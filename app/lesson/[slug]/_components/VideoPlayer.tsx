'use client';

interface VideoPlayerProps {
  videoType: 'youtube' | 'local';
  youtubeId?: string;
  videoUrl?: string;
  title: string;
  videoBlurLevel: 0 | 1 | 2;
  onYtIframeRef: (ref: HTMLIFrameElement | null) => void;
  onVideoRef: (ref: HTMLVideoElement | null) => void;
  onYtLoad: () => void;
  onLocalPlay: () => void;
  onLocalPause: () => void;
}

export default function VideoPlayer({
  videoType,
  youtubeId,
  videoUrl,
  title,
  videoBlurLevel,
  onYtIframeRef,
  onVideoRef,
  onYtLoad,
  onLocalPlay,
  onLocalPause,
}: VideoPlayerProps) {
  return (
    <div
      className={`video-wrapper ${
        videoBlurLevel === 1 ? 'video-blur-light' : videoBlurLevel === 2 ? 'video-blur-heavy' : ''
      }`}
    >
      {videoType === 'youtube' ? (
        <iframe
          ref={onYtIframeRef}
          src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${
            typeof window !== 'undefined' ? window.location.origin : ''
          }&controls=1&modestbranding=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
          onLoad={onYtLoad}
        />
      ) : (
        <video
          ref={onVideoRef}
          src={videoUrl}
          controls
          onPlay={onLocalPlay}
          onPause={onLocalPause}
        />
      )}
      {videoBlurLevel > 0 && (
        <div className="video-blur-label">
          <span>{videoBlurLevel === 1 ? '🌫️ Leicht' : '🔇 Stark'}</span>
        </div>
      )}
    </div>
  );
}
