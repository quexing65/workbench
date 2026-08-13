export function OverviewPage() {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Shanghai',
    weekday: 'long',
  }).formatToParts(now);
  const part = (type: 'day' | 'month' | 'weekday') =>
    dateParts.find((datePart) => datePart.type === type)?.value ?? '';
  const machineDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
  }).format(now);

  return (
    <section className="page overview" aria-labelledby="overview-title">
      <header className="page-header page-header--overview">
        <div>
          <p className="eyebrow">今天 · 本机工作台</p>
          <h1 id="overview-title">把今天，安稳地放在眼前。</h1>
          <p className="page-lead">任务、小记与学习进度将汇集在这里。</p>
        </div>
        <time className="date-card" dateTime={machineDate}>
          <span>{part('month')}</span>
          <strong>{part('day')}</strong>
          <small>{part('weekday')}</small>
        </time>
      </header>
      <div className="overview-grid" aria-label="总览占位内容">
        <article className="surface surface--primary">
          <p className="surface__label">今日焦点</p>
          <h2>应用骨架已准备好</h2>
          <p>后续阶段会在这里呈现最重要的待办与进度。</p>
          <span className="surface__meta">阶段 1 · 可运行骨架</span>
        </article>
        <article className="surface">
          <p className="surface__label">快速记录</p>
          <h2>小记入口</h2>
          <p>想法会在小记功能落地后安全写入本机数据库。</p>
        </article>
        <article className="surface">
          <p className="surface__label">学习</p>
          <h2>继续上次进度</h2>
          <p>B站学习资源与真实续播将在后续阶段接入。</p>
        </article>
      </div>
    </section>
  );
}
