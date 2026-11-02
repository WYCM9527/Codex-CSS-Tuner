import badge from './styles/Badge.module.css';

const rows = ['间距', '尺寸', '字体'];

export default function App() {
  return (
    <div className="page">
      <section className="card" data-testid="card-a">
        <h2 className="title" data-testid="title-a">语义 CSS 卡片</h2>
        <p className="muted">改 .card 会同时影响所有卡片。</p>
        <button className="btn" data-testid="btn">主要按钮</button>{' '}
        <button className="btn ghost" data-testid="btn-ghost">次要按钮</button>
      </section>

      <section className="card" data-testid="card-b">
        <h2 className="title">第二张卡片</h2>
        <div className="panel" data-testid="panel">
          {rows.map((r) => (
            <div className="row" key={r} data-testid="row">
              {r}
            </div>
          ))}
        </div>
      </section>

      <p className={badge.list}>
        <span className={badge.badge} data-testid="badge">
          新
        </span>
        <span className={`${badge.badge} ${badge['badge-muted']}`} data-testid="badge-muted">
          旧
        </span>
      </p>
    </div>
  );
}
