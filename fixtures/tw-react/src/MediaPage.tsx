/** 资源清单的示例：响应式图片、背景图、伪元素背景、图标、雪碧图、视频、分段播放的视频，以及看不见的图 */
const attachStream = (v: HTMLVideoElement | null) => {
  if (v && !v.src) v.src = URL.createObjectURL(new MediaSource());
};

export function MediaPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6" data-testid="media">
      <section className="rounded-card bg-white p-4 shadow" data-testid="gallery">
        <img data-testid="hero" src="/hero-640.png" srcSet="/hero-640.png 640w, /hero-1280.png 1280w" sizes="320px" width={320} height={180} alt="主图" className="rounded-lg" />
        <div className="mt-4 flex items-center gap-3" data-testid="tiles">
          <div className="size-16 rounded bg-[url(/pattern.png)]" data-testid="tile" />
          <div className="tile-before size-16 rounded bg-paper" data-testid="tile-before" />
          <img src="/badge.png" alt="徽章" className="size-12" data-testid="badge" />
          <img src="/badge.png" alt="徽章" className="size-12" />
          <img src="/badge.png" alt="徽章" className="hidden size-12" />
        </div>
      </section>

      <section className="flex items-center gap-3 text-brand" data-testid="icons">
        <svg aria-label="星标" viewBox="0 0 24 24" className="size-6" data-testid="star">
          <path fill="currentColor" d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" />
        </svg>
        <svg aria-hidden="true" className="hidden">
          <symbol id="icon-heart" viewBox="0 0 24 24">
            <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
          </symbol>
        </svg>
        <svg className="size-6 text-red-500" data-testid="heart">
          <use href="#icon-heart" fill="currentColor" />
        </svg>
      </section>

      <section className="flex gap-3" data-testid="videos">
        <video src="/clip.webm" poster="/poster.png" width={240} muted playsInline data-testid="clip" />
        <video width={240} muted ref={attachStream} data-testid="stream" />
      </section>

      <section className="relative h-24 w-48 overflow-hidden" data-testid="carousel">
        <div className="flex">
          <img src="/hero-640.png" alt="第一张" className="h-24 w-48 shrink-0" />
          <img src="/poster.png" alt="第二张" className="h-24 w-48 shrink-0" />
        </div>
      </section>

      <section data-testid="lazy">
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/hero-1280.png" width={160} height={90} alt="懒加载" data-testid="lazy-img" />
      </section>
    </main>
  );
}
