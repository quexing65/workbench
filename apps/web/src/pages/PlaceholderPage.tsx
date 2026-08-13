export interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PlaceholderPage({ eyebrow, title, description }: PlaceholderPageProps) {
  return (
    <section className="page page--placeholder" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="page-title">{title}</h1>
        <p className="page-lead">{description}</p>
      </header>
      <div className="placeholder-card">
        <span className="placeholder-card__number" aria-hidden="true">
          01
        </span>
        <div>
          <h2>功能正在搭建</h2>
          <p>应用框架已经就位。这里将在后续阶段接入真实数据和完整操作流程。</p>
        </div>
      </div>
    </section>
  );
}
