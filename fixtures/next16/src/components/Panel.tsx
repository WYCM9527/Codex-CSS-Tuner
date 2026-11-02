import styles from './Panel.module.css';

export function Panel({ title }: { title: string }) {
  return (
    <section className={styles.panel} data-testid="panel">
      <h2 className={styles.title} data-testid="panel-title">
        {title}
      </h2>
      <p className={styles['panel-body']}>Turbopack 会把类名换成带哈希的名字。</p>
    </section>
  );
}
